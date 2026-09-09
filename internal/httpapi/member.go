// 成员与身份端点：全局成员身份、工作区授权和密钥生命周期。
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/auth"
	"kanso/internal/service"
)

func (a *API) getMe(w http.ResponseWriter, r *http.Request) {
	member, err := a.svc.GetMe(r.Context(), auth.MemberID(r))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		writeServiceError(w, err, "查询当前成员失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"member": member, "mode": a.cfg.Mode})
}

func (a *API) listMembers(w http.ResponseWriter, r *http.Request) {
	members, err := a.svc.ListWorkspaceMembers(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询成员失败")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (a *API) listAllMembers(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	members, err := a.svc.ListAllMembers(r.Context())
	if err != nil {
		writeServiceError(w, err, "查询全局成员失败")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (a *API) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	err := a.svc.RequireInstanceAdmin(r.Context(), auth.MemberID(r))
	if err == nil {
		return true
	}
	if errors.Is(err, service.ErrForbidden) {
		writeError(w, http.StatusForbidden, "只有管理员可以执行此操作")
		return false
	}
	if errors.Is(err, service.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "成员不存在")
		return false
	}
	writeServiceError(w, err, "检查成员权限失败")
	return false
}

func (a *API) updateMember(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	if targetID != auth.MemberID(r) && !a.requireAdmin(w, r) {
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
	var avatar **string
	if body.Avatar != nil {
		var value *string
		if string(body.Avatar) != "null" {
			var raw string
			if err := json.Unmarshal(body.Avatar, &raw); err != nil {
				writeError(w, http.StatusBadRequest, "头像格式无效")
				return
			}
			value = &raw
		}
		avatar = &value
	}
	member, err := a.svc.UpdateMemberProfile(r.Context(), targetID, body.Name, body.AvatarColor, avatar)
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

func (a *API) createMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "成员名称不能为空")
		return
	}
	member, err := a.svc.CreateMember(r.Context(), body.Name)
	if err != nil {
		if errors.Is(err, service.ErrMemberLimit) {
			writeError(w, http.StatusConflict, "成员和管理员总数已达上限（6 人）")
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

func (a *API) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	member, err := a.svc.UpdateMemberRole(r.Context(), chi.URLParam(r, "id"), body.Role)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		if errors.Is(err, service.ErrLastAdmin) {
			writeError(w, http.StatusBadRequest, "至少保留一名管理员")
			return
		}
		if errors.Is(err, service.ErrAdminLimit) {
			writeError(w, http.StatusBadRequest, "管理员数量最多为 2 名")
			return
		}
		writeServiceError(w, err, "更新成员角色失败")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

// transferAdmin 把管理员身份原子转移给目标成员（仅当前管理员可调用）：
// 目标升为 admin、调用方降为 member，服务层同一事务内互换，管理员总数不变。
func (a *API) transferAdmin(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	member, err := a.svc.TransferAdmin(r.Context(), auth.MemberID(r), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		if errors.Is(err, service.ErrInvalidInput) {
			writeError(w, http.StatusBadRequest, "只能把管理员身份转移给普通成员")
			return
		}
		writeServiceError(w, err, "转移管理员失败")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (a *API) deleteMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	if err := a.svc.DeleteMember(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		if errors.Is(err, service.ErrLastAdmin) {
			writeError(w, http.StatusBadRequest, "至少保留一名管理员")
			return
		}
		writeServiceError(w, err, "删除成员失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) createMemberKey(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	if err := a.svc.RequireMemberKeyAccess(r.Context(), auth.MemberID(r), targetID, false); err != nil {
		if errors.Is(err, service.ErrForbidden) {
			writeError(w, http.StatusForbidden, "只能轮换自己的密钥，或由管理员管理成员密钥")
			return
		}
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		writeServiceError(w, err, "检查密钥权限失败")
		return
	}
	key, err := a.svc.RotateMemberKey(r.Context(), targetID)
	if err != nil {
		writeServiceError(w, err, "生成成员密钥失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"key": key})
}

func (a *API) revokeMemberKey(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	if err := a.svc.RequireMemberKeyAccess(r.Context(), auth.MemberID(r), targetID, true); err != nil {
		if errors.Is(err, service.ErrForbidden) {
			writeError(w, http.StatusForbidden, "只有管理员可以撤销成员密钥")
			return
		}
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "成员不存在")
			return
		}
		writeServiceError(w, err, "检查密钥权限失败")
		return
	}
	if err := a.svc.RevokeMemberKey(r.Context(), targetID); err != nil {
		writeServiceError(w, err, "撤销成员密钥失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) addWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	var body struct {
		MemberID string `json:"memberId"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.MemberID == "" {
		writeError(w, http.StatusBadRequest, "缺少成员")
		return
	}
	if err := a.svc.AddMemberToWorkspace(r.Context(), chi.URLParam(r, "id"), body.MemberID); err != nil {
		writeServiceError(w, err, "授权工作区成员失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) removeWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	if err := a.svc.RemoveMemberFromWorkspace(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "memberId")); err != nil {
		writeServiceError(w, err, "移除工作区成员失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
