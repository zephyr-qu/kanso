// 设置页配置端点测试：GET 返回生效配置、PUT 写入文件、认证与校验。
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

	// GET：返回当前生效配置，但不暴露访问密钥。
	res, body := e.do(t, http.MethodGet, "/api/settings/config", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET 配置应 200，实际 %d", res.StatusCode)
	}
	cfg := decode[map[string]any](t, body)
	if _, ok := cfg["accessKey"]; ok {
		t.Fatal("设置接口不应返回 accessKey")
	}
	if enabled, ok := cfg["autoArchiveEnabled"].(bool); !ok || !enabled {
		t.Fatalf("自动归档默认应开启，实际 %v", cfg["autoArchiveEnabled"])
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

	// PUT 合法配置（wsOrigins；运行模式仅由 KANSO_MODE 启动时决定，不接受保存）→ 200 + ok。
	res, body = e.do(t, http.MethodPut, "/api/settings/config",
		`{"addr":":9999","dataDir":"/saved-data","wsOrigins":"http://a.dev,http://b.dev","autoArchiveEnabled":false}`)
	// 文件内容已持久化。
	fileCfg, err := config.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("读取配置文件失败: %v", err)
	}
	if fileCfg.Addr != ":9999" || fileCfg.DataDir != "/saved-data" || fileCfg.AccessKey != testKey {
		t.Fatalf("文件内容不符: %+v", fileCfg)
	}
	if fileCfg.WSOrigins != "http://a.dev,http://b.dev" {
		t.Fatalf("文件 wsOrigins 不符: %+v", fileCfg)
	}
	if fileCfg.AutoArchiveEnabled == nil || !*fileCfg.AutoArchiveEnabled {
		t.Fatalf("设置页不能关闭自动归档，配置文件应保留开启状态: %+v", fileCfg)
	}

	// 页面保存不会提交开关字段，自动归档开关仍由配置文件控制。
	if res, _ := e.do(t, http.MethodPut, "/api/settings/config",
		`{"addr":":9999","dataDir":"/saved-data","wsOrigins":"http://a.dev,http://b.dev"}`); res.StatusCode != http.StatusOK {
		t.Fatalf("不提交自动归档开关时仍应保存成功，实际 %d", res.StatusCode)
	}
	fileCfg, err = config.ReadFile(cfgPath)
	if err != nil || fileCfg.AutoArchiveEnabled == nil || !*fileCfg.AutoArchiveEnabled {
		t.Fatalf("页面保存不应改变自动归档开关: %+v, err=%v", fileCfg, err)
	}

	// 保存设置不应改变当前访问密钥。
	if res, _ := e.doAuth(t, testKey, http.MethodGet, "/api/workspaces", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("当前密钥应继续可用，实际 %d", res.StatusCode)
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
