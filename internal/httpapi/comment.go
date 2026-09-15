package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

func (a *API) getTaskDetail(w http.ResponseWriter, r *http.Request) {
	detail, err := a.svc.GetTaskDetail(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询任务详情失败")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (a *API) createComment(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	comment, err := a.svc.CreateComment(r.Context(), chi.URLParam(r, "id"), body.Content)
	if err != nil {
		writeServiceError(w, err, "发表评论失败")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (a *API) deleteComment(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityDeleteData) {
		return
	}
	if err := a.svc.DeleteComment(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err, "删除评论失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) updateComment(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	comment, err := a.svc.UpdateComment(r.Context(), chi.URLParam(r, "id"), body.Content)
	if err != nil {
		writeServiceError(w, err, "更新评论失败")
		return
	}
	writeJSON(w, http.StatusOK, comment)
}
