// Package auth 测试：中间件注入固定 admin 身份。
package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddlewareInjectsAdminID(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := AdminID(r); got != "admin" {
			t.Fatalf("AdminID 应为 admin，实际 %q", got)
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	req.Header.Set("Authorization", "Bearer secret")
	Middleware("secret")(next).ServeHTTP(httptest.NewRecorder(), req)
}

func TestAdminIDEmptyWithoutAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	if got := AdminID(req); got != "" {
		t.Fatalf("未认证时 AdminID 应为空串，实际 %q", got)
	}
}
