package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/time/rate"
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
