package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanso/internal/config"
)

func testConfig(t *testing.T) config.Config {
	t.Helper()
	return config.Config{
		Addr:      "127.0.0.1:0",
		AccessKey: "test-access-key",
		DataDir:   t.TempDir(),
		Mode:      config.ModePersonal,
	}
}

func TestNewBuildsReadyHandlerAndSeedsOwner(t *testing.T) {
	application, err := New(context.Background(), testConfig(t), "test-version", nil)
	if err != nil {
		t.Fatalf("New 失败: %v", err)
	}
	t.Cleanup(func() { _ = application.Close() })

	for _, path := range []string{"/api/health", "/api/ready"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		application.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("GET %s 应返回 200，实际 %d: %s", path, res.Code, res.Body.String())
		}
	}

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/verify",
		strings.NewReader(`{"key":"test-access-key"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	application.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("启动时应写入 owner 密钥，实际 %d: %s", res.Code, res.Body.String())
	}
}

func TestRunStopsWhenContextIsCancelled(t *testing.T) {
	application, err := New(context.Background(), testConfig(t), "test-version", nil)
	if err != nil {
		t.Fatalf("New 失败: %v", err)
	}
	t.Cleanup(func() { _ = application.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := application.Run(ctx); err != nil {
		t.Fatalf("取消 context 后 Run 应正常返回，实际: %v", err)
	}

	// Run 已经完成 Shutdown，数据库仍由 Close 负责释放。
	if err := application.Close(); err != nil {
		t.Fatalf("关闭应用资源失败: %v", err)
	}
}
