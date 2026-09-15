package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/auth"
	"kanso/internal/service"
)

// listWorkspaces 返回全部工作区。
func (a *API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := a.svc.ListWorkspaces(r.Context(), auth.MemberID(r))
	if err != nil {
		writeServiceError(w, err, "查询工作区失败")
		return
	}
	writeJSON(w, http.StatusOK, workspaces)
}

// createWorkspace 创建新工作区。
func (a *API) createWorkspace(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityManageStructure) {
		return
	}
	name, ok := decodeNameBody(w, r)
	if !ok {
		return
	}
	workspace, err := a.svc.CreateWorkspace(r.Context(), name)
	if err != nil {
		writeServiceError(w, err, "创建工作区失败")
		return
	}
	writeJSON(w, http.StatusCreated, workspace)
}

// renameWorkspace 重命名工作区。
func (a *API) renameWorkspace(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityManageStructure) {
		return
	}
	name, ok := decodeNameBody(w, r)
	if !ok {
		return
	}
	workspace, err := a.svc.RenameWorkspace(r.Context(), chi.URLParam(r, "id"), name)
	if err != nil {
		writeServiceError(w, err, "重命名工作区失败")
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}

// deleteWorkspace 删除工作区（其下项目级联删除）。
func (a *API) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityDeleteData) {
		return
	}
	if err := a.svc.DeleteWorkspace(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err, "删除工作区失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
