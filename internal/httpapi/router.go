package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kanso/internal/auth"
	"kanso/internal/config"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

// Version 由 main 注入（构建时 -ldflags "-X main.version=..."），健康检查对外暴露。
var Version = "dev"

type API struct {
	cfgMu sync.RWMutex
	cfg   config.Config
	// configFile 是配置持久化路径（设置页保存目标，config.ConfigFilePath）。
	configFile string
	svc        *service.Service
}

func NewRouter(cfg config.Config, svc *service.Service, hub *realtime.Hub) http.Handler {
	return NewRouterWithAssets(cfg, svc, hub, nil)
}

// NewRouterWithAssets builds the application router and optionally serves the
// embedded production frontend for non-API paths.
func NewRouterWithAssets(cfg config.Config, svc *service.Service, hub *realtime.Hub, assets fs.FS) http.Handler {
	a := &API{cfg: cfg, configFile: config.ConfigFilePath(), svc: svc}
	svc.SetBroadcaster(hub)
	r := chi.NewRouter()
	r.Use(requestIDMiddleware)
	r.Use(redactingLogger)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "kanso", "version": Version})
	})
	r.Get("/api/ready", a.ready)
	r.Post("/api/auth/verify", a.verify)

	// WebSocket：密钥经查询参数（浏览器无法自定义 WS 请求头），单独注册。
	r.Get("/api/ws", a.handleWS(hub))

	// 其余 /api 路由全部要求密钥。认证按成员表反查密钥（personal = 单一 owner，
	// owner 的 access_key 由启动时 SeedOwnerMember 写入 KANSO_ACCESS_KEY，ADR-0013 修订）。
	memberLookup := svc.MemberIDByKey
	r.Group(func(pr chi.Router) {
		pr.Use(auth.Middleware(memberLookup))
		// actor 中间件：把执行者名写入 ctx（dispatch 记录活动/广播用，ADR-0013 决策 5）。
		pr.Use(a.actorMiddleware)
		pr.Get("/api/workspaces", a.listWorkspaces)
		pr.Get("/api/me", a.getMe)
		// 成员管理（邀请/删除/密钥授权）仅团队模式注册（personal 成员禁用，ADR-0013 修订）；
		// PATCH /api/members/{id} 双模式注册——个人模式 owner 自我改名/头像也走成员表。
		pr.Patch("/api/members/{id}", a.updateMember)
		if cfg.Mode == config.ModeTeam {
			pr.Get("/api/workspaces/{id}/members", a.listMembers)
			pr.Post("/api/members", a.createMember)
			pr.Delete("/api/members/{id}", a.deleteMember)
			pr.Post("/api/members/{id}/key", a.createMemberKey)
		}
		pr.Post("/api/workspaces", a.createWorkspace)
		pr.Get("/api/dashboard", a.getDashboard)
		pr.Get("/api/search", a.searchTasks)
		pr.Get("/api/settings/backup", a.getBackup)
		pr.Post("/api/settings/backup", a.importBackup)
		pr.Get("/api/settings/config", a.getSettingsConfig)
		pr.Put("/api/settings/config", a.updateSettingsConfig)
		pr.Get("/api/activity", a.getActivity)
		pr.Patch("/api/workspaces/{id}", a.renameWorkspace)
		pr.Delete("/api/workspaces/{id}", a.deleteWorkspace)
		pr.Get("/api/workspaces/{id}/projects", a.listProjects)
		pr.Post("/api/workspaces/{id}/projects", a.createProject)
		pr.Patch("/api/projects/{id}", a.renameProject)
		pr.Get("/api/pinned-projects", a.listPinnedProjects)
		pr.Post("/api/projects/{id}/pinned", a.setProjectPinned)
		pr.Delete("/api/projects/{id}", a.deleteProject)
		pr.Get("/api/projects/{id}", a.getBoard)
		pr.Get("/api/projects/{id}/archived-tasks", a.listArchivedTasks)
		pr.Get("/api/projects/{id}/milestones", a.listMilestones)
		pr.Post("/api/projects/{id}/milestones", a.createMilestone)
		pr.Get("/api/milestones/{id}/tasks", a.listMilestoneTasks)
		pr.Patch("/api/milestones/{id}", a.updateMilestone)
		pr.Delete("/api/milestones/{id}", a.deleteMilestone)
		pr.Post("/api/projects/{id}/columns", a.createColumn)
		pr.Patch("/api/columns/{id}", a.updateColumn)
		pr.Delete("/api/columns/{id}", a.deleteColumn)
		pr.Post("/api/columns/{id}/tasks", a.createTask)
		pr.Patch("/api/tasks/{id}", a.updateTask)
		pr.Post("/api/tasks/{id}/archive", a.archiveTask)
		pr.Post("/api/tasks/{id}/restore", a.restoreTask)
		pr.Post("/api/tasks/{taskId}/milestones/{milestoneId}", a.attachMilestone)
		pr.Delete("/api/tasks/{taskId}/milestones/{milestoneId}", a.detachMilestone)
		pr.Delete("/api/tasks/{id}", a.deleteTask)
		pr.Post("/api/projects/{id}/labels", a.createLabel)
		pr.Patch("/api/labels/{id}", a.updateLabel)
		pr.Delete("/api/labels/{id}", a.deleteLabel)
		pr.Post("/api/tasks/{taskId}/labels/{labelId}", a.attachLabel)
		pr.Delete("/api/tasks/{taskId}/labels/{labelId}", a.detachLabel)
		pr.Get("/api/tasks/{id}", a.getTaskDetail)
		pr.Post("/api/tasks/{id}/comments", a.createComment)
		pr.Delete("/api/comments/{id}", a.deleteComment)
	})
	r.NotFound(staticHandler(assets).ServeHTTP)

	return r
}

// ready reports whether the process can serve requests that depend on SQLite.
// Unlike health, this endpoint checks the live database connection and is used
// by container health checks and orchestration readiness probes.
func (a *API) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.svc.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"ok":    false,
			"name":  "kanso",
			"error": "database unavailable",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "kanso", "version": Version})
}

// actorMiddleware 把执行者名注入 ctx（dispatch 记录活动/广播用）。
// 两种模式均按认证成员反查成员名（personal = 单一 owner，ADR-0013 修订）。
func (a *API) actorMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor := "Admin"
		if name, ok := a.svc.MemberNameByID(r.Context(), auth.MemberID(r)); ok {
			actor = name
		}
		next.ServeHTTP(w, r.WithContext(service.WithActor(r.Context(), actor)))
	})
}

// redactingLogger keeps access keys out of request logs while preserving the
// original query string for the handler (WebSocket clients cannot set headers).
func redactingLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := *r.URL
		query := u.Query()
		if query.Has("key") {
			query.Set("key", "[REDACTED]")
			u.RawQuery = query.Encode()
		}
		log.Printf("request_id=%s %s %s", requestIDFromRequest(r), r.Method, u.RequestURI())
		next.ServeHTTP(w, r)
	})
}

type requestIDContextKey struct{}

const maxRequestIDLength = 128

func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if !validRequestID(id) {
			id = newRequestID()
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDContextKey{}, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func requestIDFromRequest(r *http.Request) string {
	if id, ok := r.Context().Value(requestIDContextKey{}).(string); ok {
		return id
	}
	return r.Header.Get("X-Request-ID")
}

func validRequestID(id string) bool {
	if id == "" || len(id) > maxRequestIDLength {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("-_.:", r)) {
			return false
		}
	}
	return true
}

func newRequestID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err == nil {
		return hex.EncodeToString(buf)
	}
	return "generated-request-id"
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
	// 按成员表校验密钥（personal = 单一 owner，owner.access_key = KANSO_ACCESS_KEY）。
	if !a.svc.VerifyKey(r.Context(), body.Key) {
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
	payload := map[string]string{"error": message}
	if id := w.Header().Get("X-Request-ID"); id != "" {
		payload["requestId"] = id
		log.Printf("request_id=%s status=%d error=%s", id, status, message)
	}
	writeJSON(w, status, payload)
}

func statusForServiceError(err error) int {
	switch service.ClassifyError(err) {
	case service.ErrorNotFound:
		return http.StatusNotFound
	case service.ErrorForbidden:
		return http.StatusForbidden
	case service.ErrorInvalidInput:
		return http.StatusBadRequest
	case service.ErrorConflict:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func writeServiceError(w http.ResponseWriter, err error, fallback string) {
	writeError(w, statusForServiceError(err), fallback)
}

// decodeBody 解析请求体；失败时已写入 400 响应并返回 false。
// maxBodyBytes 限制请求体大小（1 MiB），防止超大 JSON（标签数组/评论正文）占用内存。
const maxBodyBytes = 1 << 20

// decodeBody 解析请求体；失败（含超限）时已写入 400 响应并返回 false。
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid body")
		return false
	}
	return true
}

// decodeNameBody 解析仅含必填 name 的请求体；解析失败或名称为空时已写 400 并返回 false。
// 多字段 body（列 wipLimit / 里程碑 dueDate / 项目 template）各自保留显式结构。
func decodeNameBody(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeBody(w, r, &body) {
		return "", false
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, name+"不能为空")
		return "", false
	}
	return body.Name, true
}
