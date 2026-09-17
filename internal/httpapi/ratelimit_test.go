package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"

	"kanso/internal/auth"
)

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:1234"
	if got := clientIP(req); got != "10.0.0.8" {
		t.Fatalf("RemoteAddr IP 应为 10.0.0.8，实际 %q", got)
	}
	req.Header.Set("X-Forwarded-For", "1.1.1.1, 2.2.2.2")
	if got := clientIP(req); got != "1.1.1.1" {
		t.Fatalf("X-Forwarded-For 应取首跳，实际 %q", got)
	}
}

func TestRateLimitByIP(t *testing.T) {
	lim := newIPRateLimiter(rate.Limit(1), 1)
	handler := rateLimitByIP(lim)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	ok := httptest.NewRequest(http.MethodPost, "/api/auth/verify", nil)
	ok.RemoteAddr = "10.0.0.1:9"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, ok)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("第一次应放行，实际 %d", rec.Code)
	}

	blocked := httptest.NewRequest(http.MethodPost, "/api/auth/verify", nil)
	blocked.RemoteAddr = "10.0.0.1:9"
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, blocked)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("同 IP 超限应 429，实际 %d", rec.Code)
	}

	other := httptest.NewRequest(http.MethodPost, "/api/auth/verify", nil)
	other.RemoteAddr = "10.0.0.2:9"
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, other)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("不同 IP 应放行，实际 %d", rec.Code)
	}
}

func TestUnauthorizedOrRateLimit(t *testing.T) {
	lim := newIPRateLimiter(rate.Limit(1), 1)
	reject := unauthorizedOrRateLimit(lim)

	first := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	first.RemoteAddr = "10.0.0.3:9"
	rec := httptest.NewRecorder()
	reject(rec, first)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("第一次失败应 401，实际 %d", rec.Code)
	}

	second := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	second.RemoteAddr = "10.0.0.3:9"
	rec = httptest.NewRecorder()
	reject(rec, second)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("同 IP 失败超限应 429，实际 %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") != "1" {
		t.Fatalf("429 应带 Retry-After: 1，实际 %q", rec.Header().Get("Retry-After"))
	}

	other := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	other.RemoteAddr = "10.0.0.4:9"
	rec = httptest.NewRecorder()
	reject(rec, other)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("不同 IP 失败应 401，实际 %d", rec.Code)
	}
}

func TestBearerSuccessDoesNotConsumeLimiter(t *testing.T) {
	lim := newIPRateLimiter(rate.Limit(1), 1)
	lookup := func(_ context.Context, key string) (string, bool) {
		return "member-1", key == "ok"
	}
	h := auth.MiddlewareWithReject(lookup, unauthorizedOrRateLimit(lim))(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}),
	)

	fail := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	fail.Header.Set("Authorization", "Bearer no")
	fail.RemoteAddr = "10.0.0.5:9"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, fail)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("错误密钥应 401，实际 %d", rec.Code)
	}

	ok := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	ok.Header.Set("Authorization", "Bearer ok")
	ok.RemoteAddr = "10.0.0.5:9"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, ok)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("正确密钥不应消耗失败额度，实际 %d", rec.Code)
	}

	again := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	again.Header.Set("Authorization", "Bearer no")
	again.RemoteAddr = "10.0.0.5:9"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, again)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("失败额度用尽后应 429，实际 %d", rec.Code)
	}
}
