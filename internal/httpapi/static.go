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
