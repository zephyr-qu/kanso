package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// listLabels 返回工作区下的标签库。
func (a *API) listLabels(w http.ResponseWriter, r *http.Request) {
	labels, err := a.svc.ListLabels(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查询标签失败")
		return
	}
	writeJSON(w, http.StatusOK, labels)
}

// createLabel 创建工作区级标签（名称必填，颜色缺省蓝色）。
func (a *API) createLabel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "标签名称不能为空")
		return
	}
	if body.Color == "" {
		body.Color = "#3b82f6"
	}
	label, err := a.svc.CreateLabel(r.Context(), chi.URLParam(r, "id"), body.Name, body.Color)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "创建标签失败")
		return
	}
	writeJSON(w, http.StatusCreated, label)
}

// updateLabel 更新标签名称/颜色（缺失字段保持不变）。
func (a *API) updateLabel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  *string `json:"name"`
		Color *string `json:"color"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name != nil && *body.Name == "" {
		writeError(w, http.StatusBadRequest, "标签名称不能为空")
		return
	}
	label, err := a.svc.UpdateLabel(r.Context(), chi.URLParam(r, "id"), body.Name, body.Color)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "标签不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "更新标签失败")
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
		writeError(w, http.StatusInternalServerError, "删除标签失败")
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
		writeError(w, http.StatusInternalServerError, "贴标签失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// detachLabel 从任务移除标签。
func (a *API) detachLabel(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DetachLabel(r.Context(), chi.URLParam(r, "taskId"), chi.URLParam(r, "labelId")); err != nil {
		writeError(w, http.StatusInternalServerError, "移除标签失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
