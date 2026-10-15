// staticHandler 测试：SPA 静态服务 + client-side 路由回退 + API 404。
// 落地页不在应用里（apps/landing 是独立站点，与应用各自部署），所以这里没有落地页用例。
package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testSPA() *fstest.MapFS {
	return &fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte("<html>kanso spa</html>")},
		"favicon.ico":   &fstest.MapFile{Data: []byte("fake-ico")},
		"assets/app.js": &fstest.MapFile{Data: []byte("console.log(1)")},
	}
}

// 根路径返回应用自己的前端：打开就是应用（未登录时由前端路由送去登录页）。
func TestStaticHandlerServesSPAIndexAtRoot(t *testing.T) {
	h := staticHandler(testSPA())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET / 应 200，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso spa") {
		t.Fatalf("应返回 SPA index.html: %s", rec.Body.String())
	}
}

// 构建产物按原文件直出，不被任何其它资源抢占。
func TestStaticHandlerServesSPAFile(t *testing.T) {
	h := staticHandler(testSPA())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /assets/app.js 应 200，实际 %d", rec.Code)
	}
	if rec.Body.String() != "console.log(1)" {
		t.Fatalf("应返回文件内容，实际 %q", rec.Body.String())
	}
}

func TestStaticHandlerFallsBackForClientRoutes(t *testing.T) {
	h := staticHandler(testSPA())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/login", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("client route 应 200（回退 SPA index），实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso spa") {
		t.Fatalf("应回退到 SPA index.html: %s", rec.Body.String())
	}
}

func TestStaticHandlerRejectsNonGet(t *testing.T) {
	h := staticHandler(testSPA())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST 应 404，实际 %d", rec.Code)
	}
}

func TestStaticHandlerRejectsAPIPaths(t *testing.T) {
	h := staticHandler(testSPA())
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
