package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSlogRecoverer(t *testing.T) {
	handler := requestIDMiddleware(slogRecoverer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})))
	req := httptest.NewRequest(http.MethodGet, "/api/boom?key=secret", nil)
	req.Header.Set("X-Request-ID", "panic-test-1")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("panic 应 500，实际 %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("解析错误 JSON: %v", err)
	}
	if body["error"] != "internal server error" {
		t.Fatalf("错误信息应为 internal server error，实际 %q", body["error"])
	}
	if body["requestId"] != "panic-test-1" {
		t.Fatalf("应带回请求 ID，实际 %q", body["requestId"])
	}
}

func TestSlogRecovererAbortHandler(t *testing.T) {
	defer func() {
		if rec := recover(); rec != http.ErrAbortHandler {
			t.Fatalf("应原样抛出 ErrAbortHandler，实际 %v", rec)
		}
	}()
	slogRecoverer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	t.Fatal("应 panic")
}

func TestRedactedRequestURI(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ws?key=secret&foo=1", nil)
	got := redactedRequestURI(req)
	if got != "/api/ws?foo=1&key=%5BREDACTED%5D" {
		t.Fatalf("应脱敏 key，实际 %q", got)
	}
	if req.URL.Query().Get("key") != "secret" {
		t.Fatal("原始请求的 key 不应被改写")
	}
}
