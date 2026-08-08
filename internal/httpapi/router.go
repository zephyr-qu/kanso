package httpapi

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kanso/internal/auth"
	"kanso/internal/config"
)

type API struct {
	cfg config.Config
	db  *sql.DB
}

func NewRouter(cfg config.Config, database *sql.DB) http.Handler {
	a := &API{cfg: cfg, db: database}
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "kanso"})
	})
	r.Post("/api/auth/verify", a.verify)

	// 其余 /api 路由全部要求密钥（M1 在此挂 workspace/project/column/task/label/comment/activity）。
	r.Group(func(pr chi.Router) {
		pr.Use(auth.Middleware(cfg.AccessKey))
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
