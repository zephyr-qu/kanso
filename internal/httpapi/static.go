package httpapi

import (
	"io/fs"
	"net/http"
	"strings"
)

// staticHandler serves the embedded SPA for every non-API path, with an index.html
// fallback for client-side routes.
//
// 落地页不在这里：它是独立站点（apps/landing，由 cmd/landing 预览、部署在 Cloudflare），
// 应用只服务自己的前端，所以根路径就是应用本身。
func staticHandler(spa fs.FS) http.Handler {
	if spa == nil {
		return http.NotFoundHandler()
	}
	spaFiles := http.FileServer(http.FS(spa))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			http.NotFound(w, r)
			return
		}
		setSecurityHeaders(w.Header())

		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		if info, err := fs.Stat(spa, name); err == nil && !info.IsDir() {
			spaFiles.ServeHTTP(w, r)
			return
		}

		// React Router owns application paths such as /login and /w/:id.
		// 不能经 http.FileServer 服务 /index.html——net/http 对以 index.html 结尾的
		// 路径会 301 重定向到父目录，client-side 路由刷新会丢失路径。直接读文件输出。
		if content, err := fs.ReadFile(spa, "index.html"); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(content)
			return
		}
		http.NotFound(w, r)
	})
}

// contentSecurityPolicy 是应用页面的安全基线（M6-4），取值依据是 web/src 的实际依赖：
//   - script-src 'self'：脚本全是构建产物，没有内联脚本；
//   - style-src 'self' 'unsafe-inline'：React 的内联 style 属性与 dnd-kit 的 transform；
//   - img-src 'self' data: blob:：头像用 data URL，导出与分享卡用 blob/data URL；
//   - font-src 'self'：字体自托管（web/src/index.css 的 @font-face）；
//   - connect-src 'self' ws: wss:：同源 API 与 WebSocket（'self' 在部分内核不覆盖 ws:）；
//   - object-src/base-uri/form-action/frame-ancestors：收紧其余入口。
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
	"connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; " +
	"form-action 'self'; frame-ancestors 'none'"

// setSecurityHeaders 给应用页面加安全基线。只覆盖非 /api 的静态响应：
// API 返回 JSON，CSP 对它没有意义。
func setSecurityHeaders(h http.Header) {
	h.Set("Content-Security-Policy", contentSecurityPolicy)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "DENY")
}
