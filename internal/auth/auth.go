// 认证中间件：Authorization: Bearer <key> 命中某成员凭证哈希后注入成员身份。
// 密钥即身份（ADR-0002 演进，见 0006 规划 Phase 1）：不再有单一共享密钥，每个成员独立密钥。
package auth

import (
	"context"
	"net/http"
	"strings"
)

type ctxKey int

const memberIDKey ctxKey = 0

// MemberLookup 按访问密钥查找成员，命中返回 memberID；未命中返回 false。
type MemberLookup func(ctx context.Context, key string) (string, bool)

// RejectFunc 在 Bearer 查找失败时写响应（例如 401，或叠加失败限流后的 429）。
type RejectFunc func(w http.ResponseWriter, r *http.Request)

func defaultUnauthorized(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
}

// Middleware 校验 Bearer 密钥命中成员密钥表，通过后注入该成员 ID。
func Middleware(lookup MemberLookup) func(http.Handler) http.Handler {
	return MiddlewareWithReject(lookup, nil)
}

// MiddlewareWithReject 与 Middleware 相同，但查找失败时调用 reject；reject 为 nil 时写 401。
func MiddlewareWithReject(lookup MemberLookup, reject RejectFunc) func(http.Handler) http.Handler {
	if reject == nil {
		reject = defaultUnauthorized
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			memberID, ok := lookup(r.Context(), token)
			if !ok {
				reject(w, r)
				return
			}
			ctx := context.WithValue(r.Context(), memberIDKey, memberID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// MemberID 返回中间件注入的成员 ID；未通过认证时为 ""。
func MemberID(r *http.Request) string {
	v, _ := r.Context().Value(memberIDKey).(string)
	return v
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return ""
	}
	return strings.TrimSpace(h[len("bearer "):])
}
