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
		writeError(w, http.StatusInternalServerError, "查询项目列表失败")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

// createProject 创建项目（自动种子默认列）。
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
		writeError(w, http.StatusInternalServerError, "创建项目失败")
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

// renameProject 重命名项目。
func (a *API) renameProject(w http.ResponseWriter, r *http.Request) {
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
	project, err := a.svc.RenameProject(r.Context(), chi.URLParam(r, "id"), body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "重命名项目失败")
		return
	}
	writeJSON(w, http.StatusOK, project)
}

// deleteProject 删除项目（其下列/任务等级联删除）。
func (a *API) deleteProject(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteProject(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "删除项目失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
