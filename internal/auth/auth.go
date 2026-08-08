package auth

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
)

type ctxKey int

const adminIDKey ctxKey = 0

// Middleware 校验共享访问密钥（Authorization: Bearer <key>），通过后注入固定 admin 身份。
func Middleware(accessKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(accessKey)) != 1 {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), adminIDKey, "admin")
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AdminID 返回中间件注入的固定身份；未通过认证时为 ""。
func AdminID(r *http.Request) string {
	v, _ := r.Context().Value(adminIDKey).(string)
	return v
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return ""
	}
	return strings.TrimSpace(h[len("bearer "):])
}
