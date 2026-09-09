package httpapi

import (
	"io/fs"
	"net/http"
	"strings"
)

// staticHandler serves the embedded landing page at "/", landing assets, and the
// SPA for all other non-API paths (with index.html fallback for client routes).
func staticHandler(spa fs.FS, landing fs.FS) http.Handler {
	if spa == nil && landing == nil {
		return http.NotFoundHandler()
	}

	var spaFiles http.Handler
	if spa != nil {
		spaFiles = http.FileServer(http.FS(spa))
	}
	var landingFiles http.Handler
	if landing != nil {
		landingFiles = http.FileServer(http.FS(landing))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			http.NotFound(w, r)
			return
		}

		if landing != nil && serveLanding(w, r, landing, landingFiles) {
			return
		}

		if spa == nil {
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

		// React Router owns application paths such as /dashboard and /w/:id.
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

// serveLanding handles "/" and landing-owned assets. Returns true when the
// request was fully handled (including 404 for a missing landing asset path).
func serveLanding(w http.ResponseWriter, r *http.Request, landing fs.FS, files http.Handler) bool {
	path := r.URL.Path
	if path == "/" || path == "" {
		content, err := fs.ReadFile(landing, "index.html")
		if err != nil {
			return false
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(content)
		return true
	}

	name := strings.TrimPrefix(path, "/")
	if !isLandingAsset(name) {
		return false
	}
	if info, err := fs.Stat(landing, name); err != nil || info.IsDir() {
		http.NotFound(w, r)
		return true
	}
	files.ServeHTTP(w, r)
	return true
}

func isLandingAsset(name string) bool {
	return name == "style.css" || name == "favicon.svg" || strings.HasPrefix(name, "fonts/")
}
