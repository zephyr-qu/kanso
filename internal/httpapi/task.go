package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// createTask 在列末尾创建任务（标题必填）。
func (a *API) createTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       string  `json:"title"`
		Description *string `json:"description"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Title == "" {
		writeError(w, http.StatusBadRequest, "任务标题不能为空")
		return
	}
	task, _, err := a.svc.CreateTask(r.Context(), chi.URLParam(r, "id"), body.Title, deref(body.Description))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "列不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "创建任务失败")
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

// updateTask 更新任务标题/描述（body 中缺失的字段保持不变）。
func (a *API) updateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Title != nil && *body.Title == "" {
		writeError(w, http.StatusBadRequest, "任务标题不能为空")
		return
	}
	task, err := a.svc.UpdateTask(r.Context(), chi.URLParam(r, "id"), body.Title, body.Description)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "更新任务失败")
		return
	}
	writeJSON(w, http.StatusOK, task)
}

// deleteTask 删除任务。
func (a *API) deleteTask(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteTask(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "删除任务失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
