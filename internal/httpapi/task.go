package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// createTask 在列末尾创建任务（标题必填；labels 为项目内标签 ID，创建时贴好）。
func (a *API) createTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       string   `json:"title"`
		Description *string  `json:"description"`
		Priority    *string  `json:"priority"`
		DueDate     *string  `json:"dueDate"`
		Labels      []string `json:"labels"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Title == "" {
		writeError(w, http.StatusBadRequest, "任务标题不能为空")
		return
	}
	priority := ""
	if body.Priority != nil {
		priority = *body.Priority
	}
	task, _, err := a.svc.CreateTask(r.Context(), chi.URLParam(r, "id"), body.Title, deref(body.Description), priority, body.DueDate, body.Labels)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "列不存在")
			return
		}
		if errors.Is(err, service.ErrCrossProjectMove) {
			writeError(w, http.StatusBadRequest, "任务与标签必须属于同一项目")
			return
		}
		if errors.Is(err, service.ErrLabelNotFound) {
			writeError(w, http.StatusBadRequest, "标签不存在")
			return
		}
		writeServiceError(w, err, "创建任务失败")
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

// updateTask 更新任务标题/描述（body 中缺失的字段保持不变）；含 columnId/position 时执行移动。
func (a *API) updateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Priority    *string `json:"priority"`
		DueDate     *string `json:"dueDate"`
		ColumnID    *string `json:"columnId"`
		Position    *int64  `json:"position"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	taskID := chi.URLParam(r, "id")

	// 移动/排序（含 columnId 或 position）。
	if body.ColumnID != nil || body.Position != nil {
		position := int64(0)
		if body.Position != nil {
			position = *body.Position
		}
		task, err := a.svc.MoveTask(r.Context(), taskID, body.ColumnID, position)
		if err != nil {
			if errors.Is(err, service.ErrNotFound) {
				writeError(w, http.StatusNotFound, "任务或目标列不存在")
				return
			}
			if errors.Is(err, service.ErrCrossProjectMove) {
				writeError(w, http.StatusBadRequest, "不能跨项目移动任务")
				return
			}
			writeServiceError(w, err, "移动任务失败")
			return
		}
		// 0006 Phase 3 任务 3.1：移动返回 Task（契约要求，此前返回 {ok:true}）。
		writeJSON(w, http.StatusOK, task)
		return
	}

	if body.Title != nil && *body.Title == "" {
		writeError(w, http.StatusBadRequest, "任务标题不能为空")
		return
	}
	task, err := a.svc.UpdateTask(r.Context(), taskID, body.Title, body.Description, body.Priority, body.DueDate)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeServiceError(w, err, "更新任务失败")
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
		writeServiceError(w, err, "删除任务失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) archiveTask(w http.ResponseWriter, r *http.Request) {
	task, err := a.svc.SetTaskArchived(r.Context(), chi.URLParam(r, "id"), true)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeServiceError(w, err, "归档任务失败")
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (a *API) restoreTask(w http.ResponseWriter, r *http.Request) {
	task, err := a.svc.SetTaskArchived(r.Context(), chi.URLParam(r, "id"), false)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeServiceError(w, err, "恢复任务失败")
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
