// 成员与身份端点（0006 规划 Phase 1）：me、成员 CRUD、密钥授权。
// 形状对齐 Mock 契约（0005 §4.1-4.2）；错误沿用统一 {error} 格式。
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/auth"
	"kanso/internal/config"
	"kanso/internal/service"
)

// getMe 返回当前身份与模式（/api/me）。
// 两种模式均按认证成员查询（personal = 单一 owner 成员）。
func (a *API) getMe(w http.ResponseWriter, r *http.Request) {
	memberID := auth.MemberID(r)
	member, workspaceID, err := a.svc.GetMe(r.Context(), memberID)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		writeServiceError(w, err, "查询当前成员失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"member": member, "workspaceId": workspaceID, "mode": a.cfg.Mode})
}

// listMembers 返回工作区成员列表。
func (a *API) listMembers(w http.ResponseWriter, r *http.Request) {
	members, err := a.svc.ListMembers(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询成员失败")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (a *API) requireOwner(w http.ResponseWriter, r *http.Request) bool {
	err := a.svc.RequireOwner(r.Context(), auth.MemberID(r))
	if err == nil {
		return true
	}
	if errors.Is(err, service.ErrForbidden) {
		writeError(w, http.StatusForbidden, "只有所有者可以管理成员")
		return false
	}
	if errors.Is(err, service.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "成员不存在")
		return false
	}
	writeServiceError(w, err, "检查成员权限失败")
	return false
}

// requireOwnerInTeam 团队模式下校验 owner；个人模式恒通过（无成员表）。
// 保护破坏性端点（删工作区/项目/列）不被普通成员级联删除数据。
func (a *API) requireOwnerInTeam(w http.ResponseWriter, r *http.Request) bool {
	if a.cfg.Mode != config.ModeTeam {
		return true
	}
	return a.requireOwner(w, r)
}

// updateMember 更新成员名称/头像底色/头像（avatar 传 null 清空）。
func (a *API) updateMember(w http.ResponseWriter, r *http.Request) {
	if chi.URLParam(r, "id") != auth.MemberID(r) && !a.requireOwner(w, r) {
		return
	}
	var body struct {
		Name        *string         `json:"name"`
		AvatarColor *string         `json:"avatarColor"`
		Avatar      json.RawMessage `json:"avatar"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	// avatar 语义与 Mock 一致（web/src/mocks/handlers.ts PATCH member）：
	// 省略 → 保留现值；null → 清空；字符串 → 设置。
	var avatar **string
	if body.Avatar != nil {
		var s *string
		if string(body.Avatar) != "null" {
			var v string
			if err := json.Unmarshal(body.Avatar, &v); err != nil {
				writeError(w, http.StatusBadRequest, "头像格式无效")
				return
			}
			s = &v
		}
		avatar = &s
	}
	member, err := a.svc.UpdateMemberProfile(r.Context(), chi.URLParam(r, "id"), body.Name, body.AvatarColor, avatar)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		if errors.Is(err, service.ErrReservedName) {
			writeError(w, http.StatusBadRequest, "成员名称不能为 Admin（保留名）")
			return
		}
		writeServiceError(w, err, "更新成员失败")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

// createMember 创建普通成员（5 人上限，owner 不受限因 owner 由种子创建）。
func (a *API) createMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwner(w, r) {
		return
	}
	var body struct {
		WorkspaceID string `json:"workspaceId"`
		Name        string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.WorkspaceID == "" {
		writeError(w, http.StatusBadRequest, "缺少工作区")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "成员名称不能为空")
		return
	}
	member, err := a.svc.CreateMember(r.Context(), body.WorkspaceID, body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "工作区不存在")
			return
		}
		if errors.Is(err, service.ErrMemberLimit) {
			writeError(w, http.StatusBadRequest, "成员数量已达上限（5 人）")
			return
		}
		if errors.Is(err, service.ErrReservedName) {
			writeError(w, http.StatusBadRequest, "成员名称不能为 Admin（保留名）")
			return
		}
		writeServiceError(w, err, "创建成员失败")
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

// deleteMember 删除成员并清除其访问密钥；owner 受保护。
func (a *API) deleteMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwner(w, r) {
		return
	}
	if err := a.svc.DeleteMember(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		if errors.Is(err, service.ErrOwnerProtected) {
			writeError(w, http.StatusBadRequest, "不能删除所有者")
			return
		}
		writeServiceError(w, err, "删除成员失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// createMemberKey 为成员生成访问密钥（授权）；已存在则原样返回（幂等）。
func (a *API) createMemberKey(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwner(w, r) {
		return
	}
	key, err := a.svc.GetOrCreateMemberKey(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		writeServiceError(w, err, "生成成员密钥失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"key": key})
}
