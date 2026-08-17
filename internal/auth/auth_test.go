// Package auth 测试：中间件按成员密钥注入身份 + bearerToken 解析分支。
package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddlewareInjectsMemberID(t *testing.T) {
	lookup := func(_ context.Context, key string) (string, bool) {
		if key == "secret" {
			return "member-1", true
		}
		return "", false
	}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := MemberID(r); got != "member-1" {
			t.Fatalf("MemberID 应为 member-1，实际 %q", got)
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	req.Header.Set("Authorization", "Bearer secret")
	Middleware(lookup)(next).ServeHTTP(httptest.NewRecorder(), req)
}

func TestMiddlewareRejectsUnknownKey(t *testing.T) {
	lookup := func(_ context.Context, _ string) (string, bool) { return "", false }
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	Middleware(lookup)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("错误密钥不应进入后续 handler")
	})).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("错误密钥应 401，实际 %d", rec.Code)
	}
}

func TestMemberIDEmptyWithoutAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	if got := MemberID(req); got != "" {
		t.Fatalf("未认证时 MemberID 应为空串，实际 %q", got)
	}
}

func TestBearerTokenVariants(t *testing.T) {
	cases := []struct {
		name string
		auth string
		want string
	}{
		{name: "无 Authorization 头", want: ""},
		{name: "标准 Bearer", auth: "Bearer secret-key", want: "secret-key"},
		{name: "小写 bearer 前缀", auth: "bearer lower-key", want: "lower-key"},
		{name: "非 Bearer 前缀", auth: "Basic abc123", want: ""},
		{name: "空 token", auth: "Bearer   ", want: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.auth != "" {
				req.Header.Set("Authorization", tc.auth)
			}
			if got := bearerToken(req); got != tc.want {
				t.Fatalf("bearerToken 应为 %q，实际 %q", tc.want, got)
			}
		})
	}
}
