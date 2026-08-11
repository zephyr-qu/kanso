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
		fallback := r.Clone(r.Context())
		fallback.URL.Path = "/index.html"
		files.ServeHTTP(w, fallback)
	})
}
