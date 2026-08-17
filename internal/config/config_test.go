// Package config 测试：环境变量/配置文件解析、优先级与默认值。
package config

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// getenv 把空串视为未设置，因此置空即可测默认值。
	t.Setenv("KANSO_ADDR", "")
	t.Setenv("KANSO_ACCESS_KEY", "")
	t.Setenv("KANSO_DATA_DIR", "")
	t.Setenv("KANSO_CONFIG_FILE", filepath.Join(t.TempDir(), "absent.json"))

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
	t.Setenv("KANSO_CONFIG_FILE", filepath.Join(t.TempDir(), "absent.json"))

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

func TestReadSaveFileRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kanso-config.json")
	in := FileConfig{Addr: ":9090", DataDir: "/data/x", AccessKey: "abc"}
	if err := SaveFile(path, in); err != nil {
		t.Fatalf("写入配置文件失败: %v", err)
	}
	got, err := ReadFile(path)
	if err != nil {
		t.Fatalf("读取配置文件失败: %v", err)
	}
	if got != in {
		t.Fatalf("往返不一致: 期望 %+v，实际 %+v", in, got)
	}
	// 权限 0600（含密钥）。Windows 无 POSIX 权限位，跳过断言。
	if runtime.GOOS != "windows" {
		fi, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat 失败: %v", err)
		}
		if perm := fi.Mode().Perm(); perm != 0o600 {
			t.Fatalf("配置文件权限应为 0600，实际 %o", perm)
		}
	}
}

func TestReadFileMissing(t *testing.T) {
	got, err := ReadFile(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatalf("缺失文件应返回 nil 错误，实际 %v", err)
	}
	if got != (FileConfig{}) {
		t.Fatalf("缺失文件应返回零值，实际 %+v", got)
	}
}

func TestLoadFileDefaults(t *testing.T) {
	// 环境变量未设置时，配置文件作为中间层默认。
	t.Setenv("KANSO_ADDR", "")
	t.Setenv("KANSO_ACCESS_KEY", "")
	t.Setenv("KANSO_DATA_DIR", "")
	path := filepath.Join(t.TempDir(), "kanso-config.json")
	if err := SaveFile(path, FileConfig{Addr: ":9999", DataDir: "/file-data", AccessKey: "file-key"}); err != nil {
		t.Fatalf("写入配置文件失败: %v", err)
	}
	t.Setenv("KANSO_CONFIG_FILE", path)

	cfg := Load()
	if cfg.Addr != ":9999" {
		t.Fatalf("文件 Addr 应生效，实际 %q", cfg.Addr)
	}
	if cfg.DataDir != "/file-data" {
		t.Fatalf("文件 DataDir 应生效，实际 %q", cfg.DataDir)
	}
	if cfg.AccessKey != "file-key" {
		t.Fatalf("文件 AccessKey 应生效，实际 %q", cfg.AccessKey)
	}
}

func TestLoadEnvOverridesFile(t *testing.T) {
	// 显式环境变量优先于配置文件。
	t.Setenv("KANSO_ADDR", "127.0.0.1:1234")
	t.Setenv("KANSO_ACCESS_KEY", "env-key")
	t.Setenv("KANSO_DATA_DIR", "/env-data")
	path := filepath.Join(t.TempDir(), "kanso-config.json")
	if err := SaveFile(path, FileConfig{Addr: ":9999", DataDir: "/file-data", AccessKey: "file-key"}); err != nil {
		t.Fatalf("写入配置文件失败: %v", err)
	}
	t.Setenv("KANSO_CONFIG_FILE", path)

	cfg := Load()
	if cfg.Addr != "127.0.0.1:1234" {
		t.Fatalf("env Addr 应优先，实际 %q", cfg.Addr)
	}
	if cfg.DataDir != "/env-data" {
		t.Fatalf("env DataDir 应优先，实际 %q", cfg.DataDir)
	}
	if cfg.AccessKey != "env-key" {
		t.Fatalf("env AccessKey 应优先，实际 %q", cfg.AccessKey)
	}
}

func TestConfigFilePathOverride(t *testing.T) {
	t.Setenv("KANSO_CONFIG_FILE", "")
	if got := ConfigFilePath(); got != DefaultConfigFile {
		t.Fatalf("未设置时应返回默认 %q，实际 %q", DefaultConfigFile, got)
	}
	t.Setenv("KANSO_CONFIG_FILE", "/custom/path.json")
	if got := ConfigFilePath(); got != "/custom/path.json" {
		t.Fatalf("应返回 KANSO_CONFIG_FILE 值，实际 %q", got)
	}
}

func TestLoadFileWSOriginsOnly(t *testing.T) {
	// 运行模式仅由 KANSO_MODE 环境变量决定：文件不再携带 mode，未设环境变量时回退 personal。
	t.Setenv("KANSO_MODE", "")
	t.Setenv("KANSO_WS_ORIGINS", "")
	path := filepath.Join(t.TempDir(), "kanso-config.json")
	if err := SaveFile(path, FileConfig{WSOrigins: "http://a.dev, http://b.dev"}); err != nil {
		t.Fatalf("写入配置文件失败: %v", err)
	}
	t.Setenv("KANSO_CONFIG_FILE", path)

	cfg := Load()
	if cfg.Mode != ModePersonal {
		t.Fatalf("未设 KANSO_MODE 应默认 personal，实际 %q", cfg.Mode)
	}
	if len(cfg.WSOrigins) != 2 || cfg.WSOrigins[0] != "http://a.dev" || cfg.WSOrigins[1] != "http://b.dev" {
		t.Fatalf("文件 WSOrigins 应解析为 2 项（去空白），实际 %v", cfg.WSOrigins)
	}
}

func TestLoadEnvModeOnly(t *testing.T) {
	// mode 只认环境变量：文件即使含旧版 mode 字段也被忽略。
	t.Setenv("KANSO_MODE", "team")
	t.Setenv("KANSO_WS_ORIGINS", "http://env.dev")
	path := filepath.Join(t.TempDir(), "kanso-config.json")
	if err := SaveFile(path, FileConfig{WSOrigins: "http://file.dev"}); err != nil {
		t.Fatalf("写入配置文件失败: %v", err)
	}
	t.Setenv("KANSO_CONFIG_FILE", path)

	cfg := Load()
	if cfg.Mode != ModeTeam {
		t.Fatalf("env Mode 应生效为 team，实际 %q", cfg.Mode)
	}
	if len(cfg.WSOrigins) != 1 || cfg.WSOrigins[0] != "http://env.dev" {
		t.Fatalf("env WSOrigins 应优先，实际 %v", cfg.WSOrigins)
	}
}

func TestReadFileParseError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte("{not-json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadFile(path); err == nil {
		t.Fatal("损坏 JSON 应返回错误")
	}
}

func TestReadFileNotExistOtherError(t *testing.T) {
	// 路径是目录 → os.ReadFile 返回非 IsNotExist 错误（如 is a directory）。
	dir := t.TempDir()
	if _, err := ReadFile(dir); err == nil {
		t.Fatal("目录路径读取应返回错误")
	}
}

func TestSaveFileWriteError(t *testing.T) {
	// 父目录不存在 → WriteFile 失败。
	err := SaveFile(filepath.Join(t.TempDir(), "nested", "config.json"), FileConfig{Addr: ":1"})
	if err == nil {
		t.Fatal("不可写路径保存应返回错误")
	}
}

func TestLoadCorruptedFile(t *testing.T) {
	// 配置文件损坏 → Load 回退默认并打印警告（不阻断）。
	path := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(path, []byte("{oops"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KANSO_CONFIG_FILE", path)
	t.Setenv("KANSO_ADDR", "")
	t.Setenv("KANSO_DATA_DIR", "")
	t.Setenv("KANSO_ACCESS_KEY", "")

	cfg := Load()
	if cfg.Addr != ":8080" || cfg.DataDir != "./data" {
		t.Fatalf("损坏配置应回退默认: %+v", cfg)
	}
}
