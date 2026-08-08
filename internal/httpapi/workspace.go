package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// listWorkspaces 返回全部工作区。
func (a *API) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces, err := a.svc.ListWorkspaces(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查询工作区失败")
		return
	}
	writeJSON(w, http.StatusOK, workspaces)
}

// createWorkspace 创建新工作区。
func (a *API) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "工作区名称不能为空")
		return
	}
	workspace, err := a.svc.CreateWorkspace(r.Context(), body.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "创建工作区失败")
		return
	}
	writeJSON(w, http.StatusCreated, workspace)
}

// renameWorkspace 重命名工作区。
func (a *API) renameWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "工作区名称不能为空")
		return
	}
	workspace, err := a.svc.RenameWorkspace(r.Context(), chi.URLParam(r, "id"), body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "工作区不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "重命名工作区失败")
		return
	}
	writeJSON(w, http.StatusOK, workspace)
}

// deleteWorkspace 删除工作区（其下项目级联删除）。
func (a *API) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteWorkspace(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "工作区不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "删除工作区失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
