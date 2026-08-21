package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// listProjects 返回工作区下的项目列表。
func (a *API) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.svc.ListProjects(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询项目列表失败")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

// createProject 创建项目（自动种子固定看板默认列；0008：模板已移除，忽略请求中的 template 字段）。
func (a *API) createProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "项目名称不能为空")
		return
	}
	project, err := a.svc.CreateProject(r.Context(), chi.URLParam(r, "id"), body.Name)
	if err != nil {
		writeServiceError(w, err, "创建项目失败")
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

// renameProject 重命名项目。
func (a *API) renameProject(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeNameBody(w, r, "项目名称")
	if !ok {
		return
	}
	project, err := a.svc.RenameProject(r.Context(), chi.URLParam(r, "id"), name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "重命名项目失败")
		return
	}
	writeJSON(w, http.StatusOK, project)
}

// deleteProject 删除项目（其下列/任务等级联删除）。
func (a *API) deleteProject(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	if err := a.svc.DeleteProject(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "删除项目失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listPinnedProjects 返回跨工作区置顶项目列表。
func (a *API) listPinnedProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.svc.ListPinnedProjects(r.Context())
	if err != nil {
		writeServiceError(w, err, "查询置顶项目失败")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

// setProjectPinned 设置/取消项目置顶。
func (a *API) setProjectPinned(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Pinned bool `json:"pinned"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if err := a.svc.SetProjectPinned(r.Context(), chi.URLParam(r, "id"), body.Pinned); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "更新置顶失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
