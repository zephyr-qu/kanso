// 成员领域服务：全局身份、角色和访问密钥。
// 工作区授权由 workspace_access.go 负责；成员身份本身不携带 workspace_id。
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"kanso/internal/config"
	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// Member 是返回给前端的成员 DTO，不含访问密钥或其哈希。
type Member struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	AvatarColor *string `json:"avatarColor"`
	Avatar      *string `json:"avatar"`
	CreatedAt   string  `json:"createdAt"`
	HasKey      bool    `json:"hasKey"`
}

const (
	memberRoleAdmin  = "admin"
	memberRoleMember = "member"
	defaultAdminName = "Ad"
)

var (
	// ErrMemberLimit 表示实例身份数量已达上限。
	ErrMemberLimit = errors.New("member limit reached")
	// ErrAdminLimit 表示实例管理员数量已达上限。
	ErrAdminLimit = errors.New("admin limit reached")
	// ErrLastAdmin 表示不能删除或降级最后一名管理员。
	ErrLastAdmin = errors.New("last admin cannot be removed or demoted")
	// ErrReservedName 表示初始化管理员名称不能被普通成员占用。
	ErrReservedName = errors.New("name 'Admin' is reserved")
)

// MemberIDByKey 按访问密钥反查全局成员身份。
func (s *Service) MemberIDByKey(ctx context.Context, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	hash := hashAccessKey(key)
	member, err := gen.New(s.db).GetMemberByAccessKey(ctx, &hash)
	if err != nil {
		return "", false
	}
	return member.ID, true
}

// VerifyKey 校验密钥是否命中仍然有效的全局成员身份。
func (s *Service) VerifyKey(ctx context.Context, key string) bool {
	_, ok := s.MemberIDByKey(ctx, key)
	return ok
}

// SeedAdminMember 确保实例至少有一名管理员，并把启动密钥写入其哈希。
// 管理员是全局身份，不需要为默认工作区写入关系表。
func (s *Service) SeedAdminMember(ctx context.Context, accessKey string) error {
	q := gen.New(s.db)
	admin, err := q.GetAdminMember(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		members, listErr := listAllMembers(ctx, s.db)
		if listErr != nil {
			return fmt.Errorf("查询成员失败: %w", listErr)
		}
		if len(members) > 0 {
			if _, err := q.UpdateMemberRole(ctx, gen.UpdateMemberRoleParams{ID: members[0].ID, Role: memberRoleAdmin}); err != nil {
				return fmt.Errorf("恢复管理员角色失败: %w", err)
			}
			admin = members[0]
		} else {
			workspaces, err := q.ListWorkspaces(ctx)
			if err != nil {
				return fmt.Errorf("查询工作区失败: %w", err)
			}
			if len(workspaces) == 0 {
				return nil
			}
			memberID, err := id.New()
			if err != nil {
				return err
			}
			now := time.Now().UTC().Format(time.RFC3339)
			name := defaultAdminName
			if s.mode == config.ModePersonal {
				name = "Admin"
			}
			hash := hashAccessKey(accessKey)
			admin, err = q.CreateMember(ctx, gen.CreateMemberParams{ID: memberID, Name: name, Role: memberRoleAdmin, AccessKeyHash: &hash, CreatedAt: now})
			if err != nil {
				return fmt.Errorf("创建管理员失败: %w", err)
			}
		}
	} else if err != nil {
		return fmt.Errorf("查询管理员失败: %w", err)
	}

	hash := hashAccessKey(accessKey)
	if admin.AccessKeyHash == nil || *admin.AccessKeyHash != hash {
		if _, err := q.UpdateMemberAccessKey(ctx, gen.UpdateMemberAccessKeyParams{ID: admin.ID, AccessKeyHash: &hash}); err != nil {
			return fmt.Errorf("同步管理员访问密钥失败: %w", err)
		}
	}
	return nil
}

func listAllMembers(ctx context.Context, db *sql.DB) ([]gen.Member, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, name, role, avatar_color, avatar, access_key_hash, created_at FROM member ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []gen.Member
	for rows.Next() {
		var item gen.Member
		if err := rows.Scan(&item.ID, &item.Name, &item.Role, &item.AvatarColor, &item.Avatar, &item.AccessKeyHash, &item.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

// GetMe 返回当前全局身份。可访问工作区由 /api/workspaces 单独返回。
func (s *Service) GetMe(ctx context.Context, memberID string) (Member, error) {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return Member{}, mapNoRows(err)
	}
	return toMemberDTO(member), nil
}

func (s *Service) MemberNameByID(ctx context.Context, memberID string) (string, bool) {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return "", false
	}
	return member.Name, true
}

func (s *Service) MemberIdentityByID(ctx context.Context, memberID string) (gen.Member, bool) {
	member, err := gen.New(s.db).GetMember(ctx, memberID)
	if err != nil {
		return gen.Member{}, false
	}
	return member, true
}

func (s *Service) ListMembers(ctx context.Context, workspaceID string) ([]Member, error) {
	return s.ListWorkspaceMembers(ctx, workspaceID)
}

// ListAllMembers returns the global identity directory for administrators.
// Workspace membership is intentionally not folded into this identity list.
func (s *Service) ListAllMembers(ctx context.Context) ([]Member, error) {
	rows, err := gen.New(s.db).ListAllMembers(ctx)
	if err != nil {
		return nil, fmt.Errorf("查询全局成员失败: %w", err)
	}
	result := make([]Member, 0, len(rows))
	for _, row := range rows {
		result = append(result, toMemberDTO(row))
	}
	return result, nil
}

// RequireMemberKeyAccess allows members to rotate their own key and admins to manage any identity.
func (s *Service) RequireMemberKeyAccess(ctx context.Context, actorID, targetID string, revoke bool) error {
	actor, err := gen.New(s.db).GetMember(ctx, actorID)
	if err != nil {
		return mapNoRows(err)
	}
	if _, err := gen.New(s.db).GetMember(ctx, targetID); err != nil {
		return mapNoRows(err)
	}
	if actor.ID == targetID && !revoke {
		return nil
	}
	if actor.Role != memberRoleAdmin {
		return ErrForbidden
	}
	return nil
}

func (s *Service) UpdateMemberProfile(ctx context.Context, memberID string, name, avatarColor *string, avatar **string) (Member, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return Member{}, err
	}
	defer func() { _ = tx.Rollback() }()
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
	updated, err := q.UpdateMemberProfile(ctx, gen.UpdateMemberProfileParams{ID: memberID, Name: newName, AvatarColor: newColor, Avatar: newAvatar})
	if err != nil {
		return Member{}, fmt.Errorf("更新成员失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Member{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.emitAll(EventMemberUpdated, "", memberID)
	return toMemberDTO(updated), nil
}

// CreateMember creates a global identity. Workspace authorization is a separate operation.
func (s *Service) CreateMember(ctx context.Context, name string) (Member, error) {
	if name == "" {
		return Member{}, ErrInvalidInput
	}
	if name == "Admin" {
		return Member{}, ErrReservedName
	}
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return Member{}, err
	}
	defer func() { _ = tx.Rollback() }()
	count, err := q.CountMembers(ctx)
	if err != nil {
		return Member{}, fmt.Errorf("统计成员失败: %w", err)
	}
	if count >= int64(MaxMembers) {
		return Member{}, ErrMemberLimit
	}
	memberID, err := id.New()
	if err != nil {
		return Member{}, err
	}
	member, err := q.CreateMember(ctx, gen.CreateMemberParams{ID: memberID, Name: name, Role: memberRoleMember, CreatedAt: time.Now().UTC().Format(time.RFC3339)})
	if err != nil {
		return Member{}, fmt.Errorf("创建成员失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Member{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.emitAll(EventMemberCreated, "", member.ID)
	return toMemberDTO(member), nil
}

func (s *Service) UpdateMemberRole(ctx context.Context, targetID, role string) (Member, error) {
	if role != memberRoleAdmin && role != memberRoleMember {
		return Member{}, ErrInvalidInput
	}
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return Member{}, err
	}
	defer func() { _ = tx.Rollback() }()
	target, err := q.GetMember(ctx, targetID)
	if err != nil {
		return Member{}, mapNoRows(err)
	}
	if target.Role == role {
		return toMemberDTO(target), nil
	}
	if target.Role == memberRoleAdmin && role == memberRoleMember {
		var admins int64
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM member WHERE role = 'admin'`).Scan(&admins); err != nil {
			return Member{}, err
		}
		if admins <= 1 {
			return Member{}, ErrLastAdmin
		}
	}
	if target.Role != memberRoleAdmin && role == memberRoleAdmin {
		var admins int64
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM member WHERE role = 'admin'`).Scan(&admins); err != nil {
			return Member{}, err
		}
		if admins >= int64(MaxAdmins) {
			return Member{}, ErrAdminLimit
		}
	}
	if _, err := q.UpdateMemberRole(ctx, gen.UpdateMemberRoleParams{ID: targetID, Role: role}); err != nil {
		return Member{}, fmt.Errorf("更新成员角色失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Member{}, fmt.Errorf("提交事务失败: %w", err)
	}
	target.Role = role
	s.emitAll(EventMemberUpdated, "", targetID)
	return toMemberDTO(target), nil
}

// TransferAdmin 将管理员身份原子转移给目标成员：同一事务内目标升为 admin、
// 原管理员（调用方）降为 member。两步任一失败整体回滚，管理员总数不变，
// 因此无需再做管理员上限/保底校验——这正是"原子"的含义。
func (s *Service) TransferAdmin(ctx context.Context, fromID, toID string) (Member, error) {
	if fromID == toID {
		return Member{}, ErrInvalidInput
	}
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return Member{}, err
	}
	defer func() { _ = tx.Rollback() }()
	from, err := q.GetMember(ctx, fromID)
	if err != nil {
		return Member{}, mapNoRows(err)
	}
	if from.Role != memberRoleAdmin {
		return Member{}, ErrForbidden
	}
	target, err := q.GetMember(ctx, toID)
	if err != nil {
		return Member{}, mapNoRows(err)
	}
	if target.Role != memberRoleMember {
		return Member{}, ErrInvalidInput
	}
	if _, err := q.UpdateMemberRole(ctx, gen.UpdateMemberRoleParams{ID: toID, Role: memberRoleAdmin}); err != nil {
		return Member{}, fmt.Errorf("更新成员角色失败: %w", err)
	}
	if _, err := q.UpdateMemberRole(ctx, gen.UpdateMemberRoleParams{ID: fromID, Role: memberRoleMember}); err != nil {
		return Member{}, fmt.Errorf("更新原管理员角色失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Member{}, fmt.Errorf("提交事务失败: %w", err)
	}
	target.Role = memberRoleAdmin
	// 双方角色都变了：分别广播，便于客户端刷新列表与自身权限。
	s.emitAll(EventMemberUpdated, "", toID)
	s.emitAll(EventMemberUpdated, "", fromID)

	return toMemberDTO(target), nil
}

func (s *Service) DeleteMember(ctx context.Context, memberID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	member, err := q.GetMember(ctx, memberID)
	if err != nil {
		return mapNoRows(err)
	}
	if member.Role == memberRoleAdmin {
		var admins int64
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM member WHERE role = 'admin'`).Scan(&admins); err != nil {
			return err
		}
		if admins <= 1 {
			return ErrLastAdmin
		}
	}
	if _, err := q.DeleteMember(ctx, memberID); err != nil {
		return fmt.Errorf("删除成员失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.emitAll(EventMemberDeleted, "", memberID)
	return nil
}

func (s *Service) RotateMemberKey(ctx context.Context, memberID string) (string, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := q.GetMember(ctx, memberID); err != nil {
		return "", mapNoRows(err)
	}
	key, err := randomKey()
	if err != nil {
		return "", fmt.Errorf("生成成员密钥失败: %w", err)
	}
	key = "kanso-" + key
	hash := hashAccessKey(key)
	if _, err := q.UpdateMemberAccessKey(ctx, gen.UpdateMemberAccessKeyParams{ID: memberID, AccessKeyHash: &hash}); err != nil {
		return "", fmt.Errorf("写入成员密钥失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("提交事务失败: %w", err)
	}
	s.emitAll(EventMemberKeyRotated, "", memberID)
	return key, nil
}

func (s *Service) RevokeMemberKey(ctx context.Context, memberID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := q.GetMember(ctx, memberID); err != nil {
		return mapNoRows(err)
	}
	if _, err := q.ClearMemberAccessKey(ctx, memberID); err != nil {
		return fmt.Errorf("撤销成员密钥失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.emitAll(EventMemberKeyRevoked, "", memberID)
	return nil
}

// AdminMember returns the first admin for startup callers; the returned role is admin.
func (s *Service) AdminMember(ctx context.Context) (Member, bool) {
	admin, err := gen.New(s.db).GetAdminMember(ctx)
	if err != nil {
		return Member{}, false
	}
	return toMemberDTO(admin), true
}

func toMemberDTO(member gen.Member) Member {
	return Member{ID: member.ID, Name: member.Name, Role: member.Role, AvatarColor: member.AvatarColor, Avatar: member.Avatar, CreatedAt: member.CreatedAt, HasKey: member.AccessKeyHash != nil && *member.AccessKeyHash != ""}
}

func hashAccessKey(key string) string {
	digest := sha256.Sum256([]byte(key))
	return hex.EncodeToString(digest[:])
}

func randomKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
