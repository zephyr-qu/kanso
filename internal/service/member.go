// 成员领域服务（0006 规划 Phase 1）：多密钥认证、me、成员 CRUD、密钥授权。
// 返回给前端的 Member 一律经 toMemberDTO 剥离 access_key，避免密钥泄露。
package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"kanso/internal/config"
	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// Member 是返回给前端的成员 DTO（不含 access_key）。
type Member struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	AvatarColor *string `json:"avatarColor"`
	Avatar      *string `json:"avatar"`
	CreatedAt   string  `json:"createdAt"`
}

const (
	// MemberLimit 工作区成员数量上限（个人版 5 人；前端 profile 页与 Mock 同步）。
	MemberLimit = 5

	memberRoleOwner  = "owner"
	memberRoleMember = "member"

	// defaultOwnerName 与 Mock 种子 owner 显示名一致（前端视觉/文案对齐）。
	defaultOwnerName = "Ad"
)

// ErrMemberLimit 表示成员数量已达上限（HTTP 层映射为 400）。
var ErrMemberLimit = errors.New("member limit reached")

// ErrOwnerProtected 表示尝试删除所有者（HTTP 层映射为 400）。
var ErrOwnerProtected = errors.New("owner cannot be deleted")

// ErrReservedName 表示使用了保留名 "Admin"（HTTP 层映射为 400）。
// W-1：个人→团队切换时 ReownLegacyAdmin 会把历史 'Admin' 归属重写为 owner 名；
// 若成员可自改名 "Admin"，其历史会被静默归入 owner 名下，故创建/改名均拒绝该名字。
var ErrReservedName = errors.New("name 'Admin' is reserved")

// MemberIDByKey 按访问密钥反查成员 ID；未命中返回 false。
// 认证中间件（auth.Middleware）与 WebSocket 端点共用。
func (s *Service) MemberIDByKey(ctx context.Context, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	member, err := gen.New(s.db).GetMemberByAccessKey(ctx, &key)
	if err != nil {
		return "", false
	}
	return member.ID, true
}

// VerifyKey 校验密钥命中任一成员（/api/auth/verify）。
// team 模式按成员表反查；personal 模式由 httpapi 层直接比对 KANSO_ACCESS_KEY（无成员表）。
func (s *Service) VerifyKey(ctx context.Context, key string) bool {
	_, ok := s.MemberIDByKey(ctx, key)
	return ok
}

// SeedOwnerMember 确保存在 owner 成员，并把当前进程访问密钥写入其 access_key。
// 登录体验与单密钥时代一致：KANSO_ACCESS_KEY（或未设置时随机生成并打印的密钥）即可登录。
// 每次启动同步 owner 密钥；环境变量未设置时密钥每次启动轮换（沿用既有行为）。
func (s *Service) SeedOwnerMember(ctx context.Context, accessKey string) error {
	q := gen.New(s.db)
	owner, err := q.GetOwnerMember(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		workspaces, err := q.ListWorkspaces(ctx)
		if err != nil {
			return fmt.Errorf("查询工作区失败: %w", err)
		}
		if len(workspaces) == 0 {
			return nil // 无工作区（SeedDefaultWorkspace 未跑）时跳过，避免孤儿 owner
		}
		memberID, err := id.New()
		if err != nil {
			return err
		}
		now := time.Now().UTC().Format(time.RFC3339)
		// 初始显示名按模式：personal 保持历史固定身份 "Admin"（活动归属一致），team 用默认名。
		ownerName := defaultOwnerName
		if s.mode == config.ModePersonal {
			ownerName = "Admin"
		}
		if _, err := q.CreateMember(ctx, gen.CreateMemberParams{
			ID:          memberID,
			WorkspaceID: workspaces[0].ID,
			Name:        ownerName,
			Role:        memberRoleOwner,
			AccessKey:   &accessKey,
			CreatedAt:   now,
		}); err != nil {
			return fmt.Errorf("创建 owner 成员失败: %w", err)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("查询 owner 成员失败: %w", err)
	}
	if owner.AccessKey == nil || *owner.AccessKey != accessKey {
		if _, err := q.UpdateMemberAccessKey(ctx, gen.UpdateMemberAccessKeyParams{ID: owner.ID, AccessKey: &accessKey}); err != nil {
			return fmt.Errorf("同步 owner 访问密钥失败: %w", err)
		}
	}
	return nil
}

// GetMe 返回认证成员及其所属工作区（/api/me）。
func (s *Service) GetMe(ctx context.Context, memberID string) (Member, string, error) {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return Member{}, "", mapNoRows(err)
	}
	return toMemberDTO(member), member.WorkspaceID, nil
}

// MemberNameByID 返回成员名（dispatch 记录 actor 用）；不存在返回 false。
// 两种模式成员均入库（personal = 单一 owner），不再有模式分支。
func (s *Service) MemberNameByID(ctx context.Context, memberID string) (string, bool) {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return "", false
	}
	return member.Name, true
}

// RequireOwner protects member administration endpoints. Profile edits remain
// available to the member themselves, while inviting/revoking credentials is
// an owner-only operation.
func (s *Service) RequireOwner(ctx context.Context, memberID string) error {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return mapNoRows(err)
	}
	if member.Role != memberRoleOwner {
		return ErrForbidden
	}
	return nil
}

// ListMembers 返回工作区成员列表（按创建时间排序）。
func (s *Service) ListMembers(ctx context.Context, workspaceID string) ([]Member, error) {
	rows, err := gen.New(s.db).ListMembersByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询成员失败: %w", err)
	}
	if rows == nil {
		return []Member{}, nil
	}
	out := make([]Member, 0, len(rows))
	for _, row := range rows {
		out = append(out, toMemberDTO(row))
	}
	return out, nil
}

// UpdateMemberProfile 更新成员名称/头像底色/头像。
// name 为空串忽略（保持现状）；avatar 传 null（*body.Avatar == nil）清空头像。
func (s *Service) UpdateMemberProfile(ctx context.Context, memberID string, name, avatarColor *string, avatar **string) (Member, error) {
	q := gen.New(s.db)
	current, err := q.GetMember(ctx, memberID)
	if err != nil {
		return Member{}, mapNoRows(err)
	}
	newName := current.Name
	if name != nil && *name != "" {
		if *name == "Admin" {
			return Member{}, ErrReservedName
		}
		newName = *name
	}
	newColor := current.AvatarColor
	if avatarColor != nil && *avatarColor != "" {
		newColor = avatarColor
	}
	newAvatar := current.Avatar
	if avatar != nil {
		newAvatar = *avatar
	}
	updated, err := q.UpdateMemberProfile(ctx, gen.UpdateMemberProfileParams{
		ID:          memberID,
		Name:        newName,
		AvatarColor: newColor,
		Avatar:      newAvatar,
	})
	if err != nil {
		return Member{}, fmt.Errorf("更新成员失败: %w", err)
	}
	// 仅改名触发活动与广播；纯头像/配色变更不扰流。
	if newName != current.Name {
		if err := s.dispatch(ctx, Event{
			Action:         EventMemberUpdated,
			WorkspaceID:    current.WorkspaceID,
			EntityID:       memberID,
			Data:           map[string]string{"name": newName},
			RecordActivity: true,
		}); err != nil {
			return Member{}, err
		}
	}
	return toMemberDTO(updated), nil
}

// CreateMember 创建工作区普通成员；成员数量达上限时返回 ErrMemberLimit。
func (s *Service) CreateMember(ctx context.Context, workspaceID, name string) (Member, error) {
	q := gen.New(s.db)
	if _, err := q.GetWorkspace(ctx, workspaceID); err != nil {
		return Member{}, mapNoRows(err)
	}
	// W-1："Admin" 是保留名（personal 模式固定身份），拒绝作为成员名，避免 ReownLegacyAdmin 误归属。
	if name == "Admin" {
		return Member{}, ErrReservedName
	}
	count, err := q.CountMembersByWorkspace(ctx, workspaceID)
	if err != nil {
		return Member{}, fmt.Errorf("统计成员失败: %w", err)
	}
	if count >= MemberLimit {
		return Member{}, ErrMemberLimit
	}
	memberID, err := id.New()
	if err != nil {
		return Member{}, err
	}
	member, err := q.CreateMember(ctx, gen.CreateMemberParams{
		ID:          memberID,
		WorkspaceID: workspaceID,
		Name:        name,
		Role:        memberRoleMember,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return Member{}, fmt.Errorf("创建成员失败: %w", err)
	}
	// 工作区级事件同时写入全局活动流。
	if err := s.dispatch(ctx, Event{
		Action:         EventMemberCreated,
		WorkspaceID:    workspaceID,
		EntityID:       member.ID,
		Data:           map[string]string{"name": name},
		RecordActivity: true,
	}); err != nil {
		return Member{}, err
	}
	return toMemberDTO(member), nil
}

// DeleteMember 删除成员（同时清除其访问密钥）；owner 受保护。
func (s *Service) DeleteMember(ctx context.Context, memberID string) error {
	q := gen.New(s.db)
	member, err := q.GetMember(ctx, memberID)
	if err != nil {
		return mapNoRows(err)
	}
	if member.Role == memberRoleOwner {
		return ErrOwnerProtected
	}
	if _, err := q.DeleteMember(ctx, memberID); err != nil {
		return fmt.Errorf("删除成员失败: %w", err)
	}
	// 工作区级事件同时写入全局活动流。
	return s.dispatch(ctx, Event{
		Action:         EventMemberDeleted,
		WorkspaceID:    member.WorkspaceID,
		EntityID:       memberID,
		Data:           map[string]string{"name": member.Name},
		RecordActivity: true,
	})
}

// GetOrCreateMemberKey 为成员生成访问密钥（授权）；已存在则原样返回（幂等）。
func (s *Service) GetOrCreateMemberKey(ctx context.Context, memberID string) (string, error) {
	q := gen.New(s.db)
	member, err := q.GetMember(ctx, memberID)
	if err != nil {
		return "", mapNoRows(err)
	}
	if member.AccessKey != nil && *member.AccessKey != "" {
		return *member.AccessKey, nil
	}
	key, err := randomKey()
	if err != nil {
		return "", fmt.Errorf("生成成员密钥失败: %w", err)
	}
	key = "kanso-" + key
	if _, err := q.UpdateMemberAccessKey(ctx, gen.UpdateMemberAccessKeyParams{ID: memberID, AccessKey: &key}); err != nil {
		return "", fmt.Errorf("写入成员密钥失败: %w", err)
	}
	return key, nil
}

// toMemberDTO 剥离 access_key 的内部字段，仅暴露前端契约字段。
func toMemberDTO(member gen.Member) Member {
	return Member{
		ID:          member.ID,
		WorkspaceID: member.WorkspaceID,
		Name:        member.Name,
		Role:        member.Role,
		AvatarColor: member.AvatarColor,
		Avatar:      member.Avatar,
		CreatedAt:   member.CreatedAt,
	}
}

// OwnerMember 返回 owner 成员（main 启动时用于 ReownLegacyAdmin 取重写目标名）。
func (s *Service) OwnerMember(ctx context.Context) (Member, bool) {
	owner, err := gen.New(s.db).GetOwnerMember(ctx)
	if err != nil {
		return Member{}, false
	}
	return toMemberDTO(owner), true
}

// ReownLegacyAdmin 把历史 'Admin' 归属重写为 owner 成员名（ADR-0013 决策 2）。
// personal → team 单向切换时调用一次：既有 activity.actor / comment.author 的
// 'Admin' 统一改为 owner 名，避免活动流出现「Admin 与成员混杂」。
func (s *Service) ReownLegacyAdmin(ctx context.Context, ownerName string) error {
	q := gen.New(s.db)
	if _, err := q.ReownLegacyComments(ctx, ownerName); err != nil {
		return fmt.Errorf("重写历史评论作者失败: %w", err)
	}
	if _, err := q.ReownLegacyActivities(ctx, ownerName); err != nil {
		return fmt.Errorf("重写历史活动作者失败: %w", err)
	}
	return nil
}

// randomKey 生成 16 字节随机十六进制（128 位熵；成员密钥为长期凭证，与个人密钥 256 位对齐取 16 字节）。
// 随机源失败时返回错误（与 main.generateAccessKey 一致，拒绝退化为可预测值）。
func randomKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
