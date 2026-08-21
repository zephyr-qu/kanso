package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// createLabel 创建项目级标签（名称必填；0006 Phase 2：路由 /api/projects/{id}/labels）。
func (a *API) createLabel(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeNameBody(w, r, "标签名称")
	if !ok {
		return
	}
	label, err := a.svc.CreateLabel(r.Context(), chi.URLParam(r, "id"), name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "创建标签失败")
		return
	}
	writeJSON(w, http.StatusCreated, label)
}

// updateLabel 更新标签名称。
func (a *API) updateLabel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name *string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name != nil && *body.Name == "" {
		writeError(w, http.StatusBadRequest, "标签名称不能为空")
		return
	}
	label, err := a.svc.UpdateLabel(r.Context(), chi.URLParam(r, "id"), body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "标签不存在")
			return
		}
		writeServiceError(w, err, "更新标签失败")
		return
	}
	writeJSON(w, http.StatusOK, label)
}

// deleteLabel 删除标签（任务关联级联清除）。
func (a *API) deleteLabel(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteLabel(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "标签不存在")
			return
		}
		writeServiceError(w, err, "删除标签失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// attachLabel 给任务贴标签。
func (a *API) attachLabel(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.AttachLabel(r.Context(), chi.URLParam(r, "taskId"), chi.URLParam(r, "labelId")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务或标签不存在")
			return
		}
		if errors.Is(err, service.ErrCrossProjectMove) {
			writeError(w, http.StatusBadRequest, "任务与标签必须属于同一项目")
			return
		}
		writeServiceError(w, err, "贴标签失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// detachLabel 从任务移除标签。
func (a *API) detachLabel(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DetachLabel(r.Context(), chi.URLParam(r, "taskId"), chi.URLParam(r, "labelId")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务或标签不存在")
			return
		}
		if errors.Is(err, service.ErrCrossProjectMove) {
			writeError(w, http.StatusBadRequest, "任务与标签必须属于同一项目")
			return
		}
		writeServiceError(w, err, "移除标签失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
