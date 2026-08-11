// Package config 测试：环境变量解析与默认值。
package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	// getenv 把空串视为未设置，因此置空即可测默认值。
	t.Setenv("KANSO_ADDR", "")
	t.Setenv("KANSO_ACCESS_KEY", "")
	t.Setenv("KANSO_DATA_DIR", "")

	cfg := Load()
	if cfg.Addr != ":8080" {
		t.Fatalf("默认 Addr 应为 :8080，实际 %q", cfg.Addr)
	}
	if cfg.AccessKey != "" {
		t.Fatalf("默认 AccessKey 应为空，实际 %q", cfg.AccessKey)
	}
	if cfg.DataDir != "./data" {
		t.Fatalf("默认 DataDir 应为 ./data，实际 %q", cfg.DataDir)
	}
}

func TestLoadFromEnv(t *testing.T) {
	t.Setenv("KANSO_ADDR", "127.0.0.1:9999")
	t.Setenv("KANSO_ACCESS_KEY", "secret-key")
	t.Setenv("KANSO_DATA_DIR", "/tmp/kanso-data")

	cfg := Load()
	if cfg.Addr != "127.0.0.1:9999" {
		t.Fatalf("Addr 应为 127.0.0.1:9999，实际 %q", cfg.Addr)
	}
	if cfg.AccessKey != "secret-key" {
		t.Fatalf("AccessKey 应为 secret-key，实际 %q", cfg.AccessKey)
	}
	if cfg.DataDir != "/tmp/kanso-data" {
		t.Fatalf("DataDir 应为 /tmp/kanso-data，实际 %q", cfg.DataDir)
	}
}
