// staticHandler 测试：SPA 静态服务 + client-side 路由回退 + API 404。
package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testAssets() *fstest.MapFS {
	return &fstest.MapFS{
		"index.html":  &fstest.MapFile{Data: []byte("<html>kanso index</html>")},
		"favicon.ico": &fstest.MapFile{Data: []byte("fake-ico")},
	}
}

func TestStaticHandlerServesIndex(t *testing.T) {
	h := staticHandler(testAssets())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET / 应 200，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso index") {
		t.Fatalf("应返回 index.html 内容: %s", rec.Body.String())
	}
}

func TestStaticHandlerServesExistingFile(t *testing.T) {
	h := staticHandler(testAssets())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/favicon.ico", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET 已存在文件应 200，实际 %d", rec.Code)
	}
	if rec.Body.String() != "fake-ico" {
		t.Fatalf("应返回文件内容，实际 %q", rec.Body.String())
	}
}

func TestStaticHandlerFallsBackForClientRoutes(t *testing.T) {
	// /dashboard 是 React Router 路由，资源不存在 → 回退 index.html。
	h := staticHandler(testAssets())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/dashboard", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("client route 应 200（回退 index），实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso index") {
		t.Fatalf("应回退到 index.html: %s", rec.Body.String())
	}
}

func TestStaticHandlerRejectsNonGet(t *testing.T) {
	h := staticHandler(testAssets())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST 应 404，实际 %d", rec.Code)
	}
}

func TestStaticHandlerRejectsAPIPaths(t *testing.T) {
	h := staticHandler(testAssets())
	for _, path := range []string{"/api/workspaces", "/api"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("GET %s 应 404，实际 %d", path, rec.Code)
		}
	}
}

func TestStaticHandlerNilAssets(t *testing.T) {
	h := staticHandler(nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("nil assets 应 404，实际 %d", rec.Code)
	}
}
