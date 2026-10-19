package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/egoist/mygo"

	"kanso/internal/config"
)

// TestDesktopSettingsRoundTrip 校验 desktop.json 的读写：没文件算没设置过，坏文件要报错。
func TestDesktopSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()

	if _, ok, err := loadDesktopSettings(dir); err != nil || ok {
		t.Fatalf("没有文件时 loadDesktopSettings = (%v, %v)，期望 (false, nil)", ok, err)
	}

	if err := saveDesktopSettings(dir, desktopSettings{Mode: "team", SetupDone: true}); err != nil {
		t.Fatalf("saveDesktopSettings: %v", err)
	}
	got, ok, err := loadDesktopSettings(dir)
	if err != nil || !ok {
		t.Fatalf("loadDesktopSettings = (%+v, %v, %v)，期望读到设置", got, ok, err)
	}
	if got.Mode != "team" || !got.SetupDone {
		t.Fatalf("读回 %+v，期望 mode=team setupDone=true", got)
	}

	// 文件权限：设置里有运行模式，按数据目录同级别对待。
	assertPerm(t, desktopSettingsPath(dir), 0o600)

	if err := os.WriteFile(desktopSettingsPath(dir), []byte("{"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if _, _, err := loadDesktopSettings(dir); err == nil {
		t.Fatal("坏 JSON 应当报错")
	}
}

// TestApplyDesktopSettings 校验优先级：KANSO_MODE 环境变量 > desktop.json > 内置默认。
func TestApplyDesktopSettings(t *testing.T) {
	team := desktopSettings{Mode: "team", SetupDone: true}

	t.Run("没有设置时保持不动", func(t *testing.T) {
		cfg := config.Config{Mode: config.ModePersonal}
		applyDesktopSettings(&cfg, desktopSettings{}, false)
		if cfg.Mode != config.ModePersonal {
			t.Fatalf("模式被改成 %q", cfg.Mode)
		}
	})

	t.Run("设置生效", func(t *testing.T) {
		cfg := config.Config{Mode: config.ModePersonal}
		applyDesktopSettings(&cfg, team, true)
		if cfg.Mode != config.ModeTeam {
			t.Fatalf("模式 = %q，期望 team", cfg.Mode)
		}
	})

	t.Run("环境变量优先", func(t *testing.T) {
		t.Setenv("KANSO_MODE", "personal")
		cfg := config.Config{Mode: config.ModePersonal}
		applyDesktopSettings(&cfg, team, true)
		if cfg.Mode != config.ModePersonal {
			t.Fatalf("模式 = %q，期望环境变量压住 desktop.json 的 personal", cfg.Mode)
		}
	})
}

// TestNeedsSetup 校验首启向导的触发条件。
func TestNeedsSetup(t *testing.T) {
	cases := []struct {
		name           string
		hasSettings    bool
		envKeyProvided bool
		smokeDir       string
		force          bool
		want           bool
	}{
		{name: "全新安装", want: true},
		{name: "已经有 desktop.json", hasSettings: true, want: false},
		{name: "环境变量给了密钥", envKeyProvided: true, want: false},
		{name: "冒烟模式不弹向导", smokeDir: `C:\tmp\smoke`, want: false},
		{name: "冒烟模式即使有设置也不弹", hasSettings: true, smokeDir: `C:\tmp\smoke`, want: false},
		{name: "强制开关压过设置", hasSettings: true, envKeyProvided: true, force: true, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.force {
				t.Setenv(forceSetupEnv, "1")
			}
			if got := needsSetup(tc.hasSettings, tc.envKeyProvided, tc.smokeDir); got != tc.want {
				t.Fatalf("needsSetup = %v，期望 %v", got, tc.want)
			}
		})
	}
}

// TestPersistAccessKey 校验密钥落点：系统凭据存储可用时用它，不可用才落数据目录文件。
func TestPersistAccessKey(t *testing.T) {
	t.Run("写进凭据存储", func(t *testing.T) {
		dir := t.TempDir()
		store := &fakeStore{}
		if err := persistAccessKey(store, dir, "key-a"); err != nil {
			t.Fatalf("persistAccessKey: %v", err)
		}
		if string(store.value) != "key-a" {
			t.Fatalf("凭据存储里是 %q", store.value)
		}
		if _, err := os.Stat(keyFilePath(dir)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("凭据存储可用时不该写密钥文件，Stat err = %v", err)
		}
	})

	t.Run("凭据存储不支持时落文件", func(t *testing.T) {
		dir := t.TempDir()
		store := &fakeStore{setErr: errors.ErrUnsupported}
		if err := persistAccessKey(store, dir, "key-b"); err != nil {
			t.Fatalf("persistAccessKey: %v", err)
		}
		key, err := readKeyFile(dir)
		if err != nil || key != "key-b" {
			t.Fatalf("密钥文件 = (%q, %v)，期望 key-b", key, err)
		}
		// Windows 上 0600 只是象征性的（ACL 继承自目录），只在类 Unix 平台校验。
		assertPerm(t, keyFilePath(dir), 0o600)
	})
}

// TestCompleteSetup 校验向导提交：空密钥拒绝，成功时设置与密钥都落盘。
func TestCompleteSetup(t *testing.T) {
	dir := t.TempDir()
	store := &fakeStore{}

	if err := completeSetup(dir, store, setupResult{Mode: config.ModePersonal, Key: "  "}); err == nil {
		t.Fatal("空密钥应当报错")
	}
	if _, ok, _ := loadDesktopSettings(dir); ok {
		t.Fatal("提交失败不该留下 desktop.json")
	}

	if err := completeSetup(dir, store, setupResult{Mode: config.ModeTeam, Key: " key-c "}); err != nil {
		t.Fatalf("completeSetup: %v", err)
	}
	settings, ok, err := loadDesktopSettings(dir)
	if err != nil || !ok {
		t.Fatalf("设置没写下来: (%+v, %v, %v)", settings, ok, err)
	}
	if settings.Mode != "team" || !settings.SetupDone {
		t.Fatalf("设置 = %+v，期望 mode=team setupDone=true", settings)
	}
	// 前后空白要去掉：用户从别处复制密钥常带回车/空格。
	if string(store.value) != "key-c" {
		t.Fatalf("存进凭据存储的是 %q，期望去掉空白的 key-c", store.value)
	}
}

// TestParseSetupMode 校验向导提交的模式串：只认 personal / team，其余一律拒绝。
func TestParseSetupMode(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  config.Mode
		ok    bool
	}{
		{value: "personal", want: config.ModePersonal, ok: true},
		{value: "team", want: config.ModeTeam, ok: true},
		{value: " team ", want: config.ModeTeam, ok: true},
		{value: "", ok: false},
		{value: "Personal", ok: false},
		{value: "teams", ok: false},
	} {
		got, ok := parseSetupMode(tc.value)
		if ok != tc.ok {
			t.Fatalf("parseSetupMode(%q) ok = %v，期望 %v", tc.value, ok, tc.ok)
		}
		if ok && got != tc.want {
			t.Fatalf("parseSetupMode(%q) = %q，期望 %q", tc.value, got, tc.want)
		}
	}
}

// TestExistingAccessKey 校验向导预填：优先凭据存储，其次密钥文件，都没有就空串。
func TestExistingAccessKey(t *testing.T) {
	t.Run("凭据存储里有", func(t *testing.T) {
		store := &fakeStore{value: []byte("from-store")}
		dir := t.TempDir()
		if err := writeKeyFile(dir, "from-file"); err != nil {
			t.Fatalf("writeKeyFile: %v", err)
		}
		if got := existingAccessKey(store, dir); got != "from-store" {
			t.Fatalf("existingAccessKey = %q，期望 from-store", got)
		}
	})

	t.Run("回落到密钥文件", func(t *testing.T) {
		store := &fakeStore{getErr: mygo.ErrSecretNotFound}
		dir := t.TempDir()
		if err := writeKeyFile(dir, "from-file"); err != nil {
			t.Fatalf("writeKeyFile: %v", err)
		}
		if got := existingAccessKey(store, dir); got != "from-file" {
			t.Fatalf("existingAccessKey = %q，期望 from-file", got)
		}
	})

	t.Run("都没有", func(t *testing.T) {
		store := &fakeStore{}
		if got := existingAccessKey(store, t.TempDir()); got != "" {
			t.Fatalf("existingAccessKey = %q，期望空串（由向导生成新的）", got)
		}
	})
}

// TestMustNewAccessKey 校验生成的密钥形态：64 位十六进制，两次不重复。
func TestMustNewAccessKey(t *testing.T) {
	first, second := mustNewAccessKey(), mustNewAccessKey()
	if len(first) != 64 || strings.Trim(first, "0123456789abcdef") != "" {
		t.Fatalf("密钥 %q 不是 64 位十六进制", first)
	}
	if first == second {
		t.Fatal("两次生成同一把密钥")
	}
}

// TestSetupWritesOutsideDataDir 确认向导不往数据目录以外写东西（向导本身只碰两个文件）。
func TestSetupWritesOutsideDataDir(t *testing.T) {
	dir := t.TempDir()
	if err := completeSetup(dir, &fakeStore{}, setupResult{Mode: config.ModeTeam, Key: "key-d"}); err != nil {
		t.Fatalf("completeSetup: %v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, filepath.Base(e.Name()))
	}
	if len(names) != 1 || names[0] != desktopSettingsFile {
		t.Fatalf("数据目录里是 %v，期望只多出 %s", names, desktopSettingsFile)
	}
}

// assertPerm 校验文件的权限位。Windows 的权限来自 ACL 继承，os.WriteFile 的 mode
// 不生效（一律 0666），所以只在类 Unix 平台断言。
func assertPerm(t *testing.T, path string, want os.FileMode) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Logf("%s：Windows 不校验权限位", path)
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat %s: %v", path, err)
	}
	if perm := info.Mode().Perm(); perm != want {
		t.Fatalf("%s 权限 %o，期望 %o", path, perm, want)
	}
}
