// staticHandler 测试：落地页 + SPA 静态服务 + client-side 路由回退 + API 404。
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

func testLanding() *fstest.MapFS {
	return &fstest.MapFS{
		"index.html":     &fstest.MapFile{Data: []byte("<html>kanso landing</html>")},
		"style.css":      &fstest.MapFile{Data: []byte("body{}")},
		"favicon.svg":    &fstest.MapFile{Data: []byte("<svg/>")},
		"fonts/a.woff2":  &fstest.MapFile{Data: []byte("font")},
		"media/shot.png": &fstest.MapFile{Data: []byte("png")},
	}
}

func TestStaticHandlerServesLandingIndex(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET / 应 200，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso landing") {
		t.Fatalf("应返回落地页 index.html: %s", rec.Body.String())
	}
}

func TestStaticHandlerServesLandingAssets(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
	cases := []struct {
		path string
		want string
	}{
		{"/style.css", "body{}"},
		{"/favicon.svg", "<svg/>"},
		{"/fonts/a.woff2", "font"},
		{"/media/shot.png", "png"},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s 应 200，实际 %d", tc.path, rec.Code)
		}
		if rec.Body.String() != tc.want {
			t.Fatalf("GET %s 内容不符: %q", tc.path, rec.Body.String())
		}
	}
}

func TestStaticHandlerFallsBackToSPAWithoutLanding(t *testing.T) {
	h := staticHandler(testSPA(), nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET / 应 200，实际 %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kanso spa") {
		t.Fatalf("无落地页时应回退 SPA index: %s", rec.Body.String())
	}
}

func TestStaticHandlerServesSPAFile(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/favicon.ico", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET 已存在 SPA 文件应 200，实际 %d", rec.Code)
	}
	if rec.Body.String() != "fake-ico" {
		t.Fatalf("应返回文件内容，实际 %q", rec.Body.String())
	}
}

func TestStaticHandlerFallsBackForClientRoutes(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
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
	h := staticHandler(testSPA(), testLanding())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("POST 应 404，实际 %d", rec.Code)
	}
}

func TestStaticHandlerRejectsAPIPaths(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
	for _, path := range []string{"/api/workspaces", "/api"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("GET %s 应 404，实际 %d", path, rec.Code)
		}
	}
}

func TestStaticHandlerNilAssets(t *testing.T) {
	h := staticHandler(nil, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("nil assets 应 404，实际 %d", rec.Code)
	}
}

// 落地页不得抢占 SPA 的构建产物路径：SPA 用 /assets/*，落地页用 /media/*。
// 回归：白名单曾放行 "assets/"，导致 /assets/index-*.js 被落地页判定为「自己的资源」
// 而直接 404，应用整个白屏。
func TestStaticHandlerDoesNotShadowSPAAssets(t *testing.T) {
	h := staticHandler(testSPA(), testLanding())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /assets/app.js 应落到 SPA（200），实际 %d", rec.Code)
	}
	if rec.Body.String() != "console.log(1)" {
		t.Fatalf("应返回 SPA 的 assets 内容，实际 %q", rec.Body.String())
	}
}
