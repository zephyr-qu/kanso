package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kanso/internal/auth"
	"kanso/internal/config"
	"kanso/internal/service"
)

type API struct {
	cfg config.Config
	svc *service.Service
}

func NewRouter(cfg config.Config, svc *service.Service) http.Handler {
	a := &API{cfg: cfg, svc: svc}
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "kanso"})
	})
	r.Post("/api/auth/verify", a.verify)

	// 其余 /api 路由全部要求密钥。
	r.Group(func(pr chi.Router) {
		pr.Use(auth.Middleware(cfg.AccessKey))
		pr.Get("/api/workspaces", a.listWorkspaces)
		pr.Post("/api/workspaces", a.createWorkspace)
		pr.Patch("/api/workspaces/{id}", a.renameWorkspace)
		pr.Delete("/api/workspaces/{id}", a.deleteWorkspace)
		pr.Get("/api/workspaces/{id}/projects", a.listProjects)
		pr.Post("/api/workspaces/{id}/projects", a.createProject)
		pr.Patch("/api/projects/{id}", a.renameProject)
		pr.Delete("/api/projects/{id}", a.deleteProject)
		pr.Get("/api/projects/{id}", a.getBoard)
		pr.Post("/api/projects/{id}/columns", a.createColumn)
		pr.Patch("/api/columns/{id}", a.updateColumn)
		pr.Delete("/api/columns/{id}", a.deleteColumn)
	})

	return r
}

// verify 校验前端提交的访问密钥。
func (a *API) verify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid body"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(body.Key), []byte(a.cfg.AccessKey)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid key"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeError 输出统一错误 JSON。
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// decodeBody 解析请求体；失败时已写入 400 响应并返回 false。
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return false
	}
	return true
}
