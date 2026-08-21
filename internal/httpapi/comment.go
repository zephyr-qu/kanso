package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

// getTaskDetail 返回任务详情聚合（任务 + 标签 + 评论 + 活动），详情页单次拉取。
func (a *API) getTaskDetail(w http.ResponseWriter, r *http.Request) {
	detail, err := a.svc.GetTaskDetail(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeServiceError(w, err, "查询任务详情失败")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// createComment 在任务下发表评论。
func (a *API) createComment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Content == "" {
		writeError(w, http.StatusBadRequest, "评论内容不能为空")
		return
	}
	comment, err := a.svc.CreateComment(r.Context(), chi.URLParam(r, "id"), body.Content)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "任务不存在")
			return
		}
		writeServiceError(w, err, "发表评论失败")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

// deleteComment 删除评论。
func (a *API) deleteComment(w http.ResponseWriter, r *http.Request) {
	if err := a.svc.DeleteComment(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeError(w, http.StatusNotFound, "评论不存在")
			return
		}
		writeServiceError(w, err, "删除评论失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
