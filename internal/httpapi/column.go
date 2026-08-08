package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// getBoard 返回项目看板聚合（列 + 任务 + 标签），看板页单次拉取。
func (a *API) getBoard(w http.ResponseWriter, r *http.Request) {
	board, err := a.svc.GetBoard(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "查询看板失败")
		return
	}
	writeJSON(w, http.StatusOK, board)
}

// createColumn 在项目末尾追加新列。
func (a *API) createColumn(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "列名称不能为空")
		return
	}
	column, err := a.svc.CreateColumn(r.Context(), chi.URLParam(r, "id"), body.Name)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "项目不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "创建列失败")
		return
	}
	writeJSON(w, http.StatusCreated, column)
}

// updateColumn 重命名列或调整位置（body 可含 name 与 position 之一）。
func (a *API) updateColumn(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     *string `json:"name"`
		Position *int64  `json:"position"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	columnID := chi.URLParam(r, "id")

	if body.Position != nil {
		if err := a.svc.MoveColumn(r.Context(), columnID, *body.Position); err != nil {
			if errors.Is(err, service.ErrNotFound) {
				writeError(w, http.StatusNotFound, "列不存在")
				return
			}
			writeError(w, http.StatusInternalServerError, "移动列失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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
		writeError(w, http.StatusInternalServerError, "重命名列失败")
		return
	}
	writeJSON(w, http.StatusOK, column)
}

// deleteColumn 删除列（其下任务级联删除）。
func (a *API) deleteColumn(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteColumn(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "列不存在")
			return
		}
		writeError(w, http.StatusInternalServerError, "删除列失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
