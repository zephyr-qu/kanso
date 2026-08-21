package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

func (a *API) listArchivedTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := a.svc.ListArchivedTasks(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "查询归档任务失败")
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

// getBoard 返回项目看板聚合（列 + 任务 + 标签），看板页单次拉取。
func (a *API) getBoard(w http.ResponseWriter, r *http.Request) {
	board, err := a.svc.GetBoard(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "查询看板失败")
		return
	}
	writeJSON(w, http.StatusOK, board)
}

// createColumn 在项目末尾追加新列（可携带初始 WIP 限制；0006 Phase 3 任务 3.6）。
func (a *API) createColumn(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		WipLimit *int64 `json:"wipLimit"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "列名称不能为空")
		return
	}
	if body.WipLimit != nil && *body.WipLimit < 0 {
		writeError(w, http.StatusBadRequest, "WIP 限制无效")
		return
	}
	column, err := a.svc.CreateColumn(r.Context(), chi.URLParam(r, "id"), body.Name, body.WipLimit)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeServiceError(w, err, "创建列失败")
		return
	}
	writeJSON(w, http.StatusCreated, column)
}

// 更新列：重命名、调整位置或 WIP 限制。
// wipLimit 用 RawMessage 区分三种情况：未传（保持）、null（清空）、数值（设置）。
// 0006 Phase 3 任务 3.6：此前 *int64 无法表达「传 null 清空」。
func (a *API) updateColumn(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     *string         `json:"name"`
		Position *int64          `json:"position"`
		WipLimit json.RawMessage `json:"wipLimit"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	columnID := chi.URLParam(r, "id")
	if body.WipLimit != nil {
		var limit *int64
		if string(body.WipLimit) != "null" {
			var v int64
			if err := json.Unmarshal(body.WipLimit, &v); err != nil {
				writeError(w, http.StatusBadRequest, "WIP 限制无效")
				return
			}
			limit = &v
		}
		column, err := a.svc.UpdateColumnWIP(r.Context(), columnID, limit)
		if err != nil {
			if errors.Is(err, service.ErrNotFound) {
				writeError(w, http.StatusNotFound, "列不存在")
				return
			}
			writeError(w, http.StatusBadRequest, "WIP 限制无效")
			return
		}
		writeJSON(w, http.StatusOK, column)
		return
	}

	if body.Position != nil {
		column, err := a.svc.MoveColumn(r.Context(), columnID, *body.Position)
		if err != nil {
			if errors.Is(err, service.ErrNotFound) {
				writeError(w, http.StatusNotFound, "列不存在")
				return
			}
			writeServiceError(w, err, "移动列失败")
			return
		}
		// 0006 Phase 3 任务 3.2：移动返回 Column（契约要求，此前返回 {ok:true}）。
		writeJSON(w, http.StatusOK, column)
		return
	}

	if body.Name == nil || *body.Name == "" {
		writeError(w, http.StatusBadRequest, "缺少 name 或 position")
		return
	}
	column, err := a.svc.RenameColumn(r.Context(), columnID, *body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "列不存在")
			return
		}
		writeServiceError(w, err, "重命名列失败")
		return
	}
	writeJSON(w, http.StatusOK, column)
}

// deleteColumn 删除列（其下任务级联删除）。
func (a *API) deleteColumn(w http.ResponseWriter, r *http.Request) {
	if !a.requireOwnerInTeam(w, r) {
		return
	}
	if err := a.svc.DeleteColumn(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "列不存在")
			return
		}
		writeServiceError(w, err, "删除列失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
