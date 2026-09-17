package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// 认证探测限流：按客户端 IP 令牌桶。
// /api/auth/verify 与 WebSocket 握手每次请求消耗额度；Bearer 仅在查找失败时消耗。
const (
	authRatePerSecond = 2
	authRateBurst     = 10
	authVisitorTTL    = 10 * time.Minute
)

type ipVisitor struct {
	limiter *rate.Limiter
	last    time.Time
}

type ipRateLimiter struct {
	limit rate.Limit
	burst int
	mu    sync.Mutex
	vis   map[string]*ipVisitor
}

func newIPRateLimiter(limit rate.Limit, burst int) *ipRateLimiter {
	return &ipRateLimiter{
		limit: limit,
		burst: burst,
		vis:   make(map[string]*ipVisitor),
	}
}

func (l *ipRateLimiter) allow(ip string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.vis) > 1024 {
		l.evictLocked(now)
	}
	v, ok := l.vis[ip]
	if !ok {
		v = &ipVisitor{limiter: rate.NewLimiter(l.limit, l.burst), last: now}
		l.vis[ip] = v
	}
	v.last = now
	return v.limiter.Allow()
}

func (l *ipRateLimiter) evictLocked(now time.Time) {
	for ip, v := range l.vis {
		if now.Sub(v.last) > authVisitorTTL {
			delete(l.vis, ip)
		}
	}
}

// unauthorizedOrRateLimit 供 Bearer 失败路径：额度耗尽写 429，否则写 401。成功认证不调用。
func unauthorizedOrRateLimit(lim *ipRateLimiter) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if !lim.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "1")
			writeError(w, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
			return
		}
		writeError(w, http.StatusUnauthorized, "unauthorized")
	}
}

func rateLimitByIP(lim *ipRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !lim.allow(clientIP(r)) {
				w.Header().Set("Retry-After", "1")
				writeError(w, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			xff = xff[:i]
		}
		if ip := strings.TrimSpace(xff); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		if r.RemoteAddr != "" {
			return r.RemoteAddr
		}
		return "unknown"
	}
	return host
}
