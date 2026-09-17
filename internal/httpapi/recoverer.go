package httpapi

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"kanso/internal/logx"
)

// slogRecoverer 捕获 handler panic，打结构化日志后返回 500，避免进程退出。
func slogRecoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			if rec == http.ErrAbortHandler {
				panic(rec)
			}
			logx.With(
				slog.String("request_id", requestIDFromRequest(r)),
			).Error("http panic",
				slog.String("method", r.Method),
				slog.String("uri", redactedRequestURI(r)),
				slog.Any("panic", rec),
				slog.String("stack", string(debug.Stack())),
			)
			writeError(w, http.StatusInternalServerError, "internal server error")
		}()
		next.ServeHTTP(w, r)
	})
}
