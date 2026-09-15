package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/service"
)

func (a *API) listMilestones(w http.ResponseWriter, r *http.Request) {
	items, err := a.svc.ListMilestones(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询里程碑失败")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) createMilestone(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	var body struct {
		Name    string  `json:"name"`
		DueDate *string `json:"dueDate"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	item, err := a.svc.CreateMilestone(r.Context(), chi.URLParam(r, "id"), body.Name, body.DueDate)
	if err != nil {
		writeServiceError(w, err, "创建里程碑失败")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *API) updateMilestone(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	var body struct {
		Name    *string `json:"name"`
		DueDate *string `json:"dueDate"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	item, err := a.svc.UpdateMilestone(r.Context(), chi.URLParam(r, "id"), body.Name, body.DueDate)
	if err != nil {
		writeServiceError(w, err, "更新里程碑失败")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) deleteMilestone(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityDeleteData) {
		return
	}
	if err := a.svc.DeleteMilestone(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err, "删除里程碑失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) attachMilestone(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	err := a.svc.SetTaskMilestone(r.Context(), chi.URLParam(r, "taskId"), chi.URLParam(r, "milestoneId"), true)
	if err != nil {
		writeServiceError(w, err, "关联里程碑失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) detachMilestone(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	err := a.svc.SetTaskMilestone(r.Context(), chi.URLParam(r, "taskId"), chi.URLParam(r, "milestoneId"), false)
	if err != nil {
		writeServiceError(w, err, "解除里程碑失败")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listMilestoneTasks 返回该里程碑关联的任务。
func (a *API) listMilestoneTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := a.svc.ListMilestoneTasks(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "查询里程碑任务失败")
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}
