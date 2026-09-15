package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"kanso/internal/ai"
	"kanso/internal/service"
)

func (a *API) analyzeAICapture(w http.ResponseWriter, r *http.Request) {
	if !a.requireCapability(w, r, service.CapabilityEditContent) {
		return
	}
	var body struct {
		Text             string `json:"text"`
		DefaultProjectID string `json:"defaultProjectId"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	a.cfgMu.RLock()
	client := &ai.ChatClient{
		BaseURL: a.cfg.AIBaseURL,
		APIKey:  a.cfg.AIAPIKey,
		Model:   a.cfg.AIModel,
	}
	a.cfgMu.RUnlock()

	tasks, err := a.svc.AnalyzeAICapture(r.Context(), client, chi.URLParam(r, "id"), body.Text, body.DefaultProjectID)
	if err != nil {
		writeServiceError(w, err, "AI 分析失败")
		return
	}
	if tasks == nil {
		tasks = []service.AICaptureTask{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}
