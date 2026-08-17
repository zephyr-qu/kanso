// 设置页配置端点测试：GET 返回生效配置、PUT 写入文件、accessKey 热同步成员表、认证与校验。
package httpapi_test

import (
	"net/http"
	"path/filepath"
	"testing"

	"kanso/internal/config"
)

// TestSettingsConfigLifecycle 覆盖读取/保存/热生效全链路。
func TestSettingsConfigLifecycle(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "kanso-config.json")
	t.Setenv("KANSO_CONFIG_FILE", cfgPath)
	e := newTestEnv(t)

	// GET：返回当前生效配置（测试环境密钥 + configFile 路径）。
	res, body := e.do(t, http.MethodGet, "/api/settings/config", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET 配置应 200，实际 %d", res.StatusCode)
	}
	cfg := decode[map[string]any](t, body)
	if cfg["accessKey"] != testKey {
		t.Fatalf("accessKey 应为 %q，实际 %v", testKey, cfg["accessKey"])
	}
	if cfg["configFile"] != cfgPath {
		t.Fatalf("configFile 应为 %q，实际 %v", cfgPath, cfg["configFile"])
	}

	// PUT 非法监听地址 → 400
	res, _ = e.do(t, http.MethodPut, "/api/settings/config", `{"addr":"not-an-addr","dataDir":"./data"}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("非法 addr 应 400，实际 %d", res.StatusCode)
	}

	// PUT 空数据目录 → 400
	res, _ = e.do(t, http.MethodPut, "/api/settings/config", `{"addr":":8080","dataDir":""}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("空 dataDir 应 400，实际 %d", res.StatusCode)
	}

	// 请求体只能包含一个完整 JSON 值，尾随 JSON 也应拒绝。
	res, _ = e.do(t, http.MethodPut, "/api/settings/config", `{"addr":":8080","dataDir":"./data"} {"extra":1}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("尾随 JSON 应 400，实际 %d", res.StatusCode)
	}

	// PUT 合法配置（新密钥 + wsOrigins；运行模式仅由 KANSO_MODE 启动时决定，不接受保存）→ 200 + ok + 热生效标志。
	const newKey = "new-saved-key-123"
	res, body = e.do(t, http.MethodPut, "/api/settings/config",
		`{"addr":":9999","dataDir":"/saved-data","accessKey":"`+newKey+`","wsOrigins":"http://a.dev,http://b.dev"}`)
	// 文件内容已持久化。
	fileCfg, err := config.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("读取配置文件失败: %v", err)
	}
	if fileCfg.Addr != ":9999" || fileCfg.DataDir != "/saved-data" || fileCfg.AccessKey != newKey {
		t.Fatalf("文件内容不符: %+v", fileCfg)
	}
	if fileCfg.WSOrigins != "http://a.dev,http://b.dev" {
		t.Fatalf("文件 wsOrigins 不符: %+v", fileCfg)
	}

	// accessKey 热生效：新密钥可访问，旧密钥立即失效。
	if res, _ := e.doAuth(t, newKey, http.MethodGet, "/api/workspaces", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("新密钥应 200，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, testKey, http.MethodGet, "/api/workspaces", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("旧密钥应 401，实际 %d", res.StatusCode)
	}
}

// TestSettingsConfigAuthRequired 未认证访问配置端点一律 401。
func TestSettingsConfigAuthRequired(t *testing.T) {
	cfgPath := filepath.Join(t.TempDir(), "kanso-config.json")
	t.Setenv("KANSO_CONFIG_FILE", cfgPath)
	e := newTestEnv(t)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/settings/config"},
		{method: http.MethodPut, path: "/api/settings/config"},
	} {
		if res, _ := e.doAuth(t, "", tc.method, tc.path, ""); res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s %s 无密钥应 401，实际 %d", tc.method, tc.path, res.StatusCode)
		}
	}
}
