package httpapi

import (
	"io/fs"
	"net/http"
	"strings"
)

// staticHandler serves the embedded SPA and falls back to index.html for
// client-side routes. API paths remain normal 404s when no API route matches.
func staticHandler(assets fs.FS) http.Handler {
	if assets == nil {
		return http.NotFoundHandler()
	}

	files := http.FileServer(http.FS(assets))
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
		if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}

		// React Router owns application paths such as /dashboard and /w/:id.
		// 不能经 http.FileServer 服务 /index.html——net/http 对以 index.html 结尾的
		// 路径会 301 重定向到父目录，client-side 路由刷新会丢失路径。直接读文件输出。
		if content, err := fs.ReadFile(assets, "index.html"); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(content)
			return
		}
		http.NotFound(w, r)
	})
}
