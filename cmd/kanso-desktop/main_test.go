// 桌面壳的纯逻辑单测：密钥落位（系统凭据 / 文件回退）、preload 注入、端口回落。
// 不经 MyGo 的窗口与后端，因此不依赖系统 WebView，可在 CI 里跑。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/egoist/mygo"
)

// fakeStore 是 secretStore 的替身：value 为 nil 表示"没有存过"。
type fakeStore struct {
	value   []byte
	getErr  error
	setErr  error
	setCall int
}

func (f *fakeStore) Get(string) ([]byte, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	if f.value == nil {
		return nil, mygo.ErrSecretNotFound
	}
	return f.value, nil
}

func (f *fakeStore) Set(_ string, value []byte) error {
	f.setCall++
	if f.setErr != nil {
		return f.setErr
	}
	f.value = value
	return nil
}

func TestDesktopAccessKeyUsesCredentialStore(t *testing.T) {
	store := &fakeStore{value: []byte("stored-key")}
	dataDir := t.TempDir()

	key, source, err := desktopAccessKey(store, dataDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if key != "stored-key" || source != "system-credential-store" {
		t.Fatalf("应直接取系统凭据，实际 key=%q source=%q", key, source)
	}
	if store.setCall != 0 {
		t.Fatalf("已有密钥不应再写入，实际写入 %d 次", store.setCall)
	}
	if _, err := os.Stat(keyFilePath(dataDir)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("有系统凭据时不应落密钥文件: %v", err)
	}
}

func TestDesktopAccessKeyCreatesAndStores(t *testing.T) {
	store := &fakeStore{}
	dataDir := t.TempDir()

	key, source, err := desktopAccessKey(store, dataDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if source != "new:system-credential-store" {
		t.Fatalf("新密钥应存进系统凭据，实际 source=%q", source)
	}
	if len(key) != 64 || strings.Trim(key, "0123456789abcdef") != "" {
		t.Fatalf("新密钥应是 64 位十六进制，实际 %q", key)
	}
	if string(store.value) != key {
		t.Fatalf("密钥应已写入系统凭据，实际 %q", store.value)
	}

	// 第二次解析必须拿到同一把密钥（桌面版因此不需要登录页）。
	again, againSource, err := desktopAccessKey(store, dataDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if again != key || againSource != "system-credential-store" {
		t.Fatalf("第二次应复用同一密钥，实际 key=%q source=%q", again, againSource)
	}
}

func TestDesktopAccessKeyFallsBackToFile(t *testing.T) {
	// 没有凭据存储的系统（Linux 无 libsecret 等）：Get/Set 都返回 ErrUnsupported。
	store := &fakeStore{getErr: errors.ErrUnsupported, setErr: errors.ErrUnsupported}
	dataDir := filepath.Join(t.TempDir(), "nested") // 目录不存在，应被创建

	key, source, err := desktopAccessKey(store, dataDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if source != "new:key-file" {
		t.Fatalf("无凭据存储时应落文件，实际 source=%q", source)
	}
	info, err := os.Stat(keyFilePath(dataDir))
	if err != nil {
		t.Fatalf("密钥文件应存在: %v", err)
	}
	if runtime.GOOS != "windows" { // Windows 上 Go 不映射 Unix 权限位，读回是 0666
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Fatalf("密钥文件权限应为 0600，实际 %o", perm)
		}
	}

	// 重启（进程重新解析）应复用文件里的密钥。
	restarted := &fakeStore{getErr: errors.ErrUnsupported, setErr: errors.ErrUnsupported}
	again, againSource, err := desktopAccessKey(restarted, dataDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if again != key || againSource != "key-file" {
		t.Fatalf("重启后应复用文件中的密钥，实际 key=%q source=%q", again, againSource)
	}
}

func TestDesktopAccessKeyRecoversFromBrokenSecretStore(t *testing.T) {
	// 系统凭据读取报错（非 ErrUnsupported）时不能启动失败：
	// 写还能成功就进系统凭据，写也失败就退回文件。
	readBroken := &fakeStore{getErr: errors.New("keyring locked")}
	key, source, err := desktopAccessKey(readBroken, t.TempDir())
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if key == "" || source != "new:system-credential-store" {
		t.Fatalf("读坏但可写时应存进系统凭据，实际 key=%q source=%q", key, source)
	}

	fileDir := t.TempDir()
	broken := &fakeStore{getErr: errors.New("keyring locked"), setErr: errors.New("keyring locked")}
	key, source, err = desktopAccessKey(broken, fileDir)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if key == "" || source != "new:key-file" {
		t.Fatalf("读写都失败时应退回文件，实际 key=%q source=%q", key, source)
	}
	if _, err := os.Stat(keyFilePath(fileDir)); err != nil {
		t.Fatalf("密钥文件应存在: %v", err)
	}
}

func TestAccessKeyPreload(t *testing.T) {
	script, err := accessKeyPreload(`a"b\c`)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	// 密钥以 JSON 字面量注入：带引号/反斜杠时仍是合法 JS。
	quoted, _ := json.Marshal(`a"b\c`)
	if !strings.Contains(script, string(quoted)) {
		t.Fatalf("脚本应包含转义后的密钥字面量 %s，实际 %s", quoted, script)
	}
	storage, _ := json.Marshal(storageKey)
	// 无条件覆盖：pagePreload 已向服务端确认过密钥可用，页面里的旧值只可能是过期的。
	if strings.Contains(script, "localStorage.getItem") {
		t.Fatalf("脚本应无条件覆盖旧值，实际 %s", script)
	}
	if !strings.Contains(script, "localStorage.setItem("+string(storage)+","+string(quoted)+")") {
		t.Fatalf("脚本应写入 localStorage，实际 %s", script)
	}
	if strings.ContainsAny(script, "\r\n") {
		t.Fatalf("脚本不应换行（单行 preload），实际 %q", script)
	}
}

func TestDesktopAddrKeepsConfiguredPort(t *testing.T) {
	// 先占一个端口再放开，取到一个当时空闲的端口号。
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("监听失败: %v", err)
	}
	free := ln.Addr().String()
	_, port, err := net.SplitHostPort(free)
	if err != nil {
		t.Fatalf("解析地址失败: %v", err)
	}

	// 端口被占用：必须回落到别的端口，并报告 fellBack。
	if addr, fellBack, err := desktopAddr(free); err != nil {
		t.Fatalf("不应报错: %v", err)
	} else if !fellBack {
		t.Fatalf("端口被占用应回落，实际 addr=%q fellBack=%v", addr, fellBack)
	}

	_ = ln.Close()
	addr, fellBack, err := desktopAddr(":" + port)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if fellBack {
		t.Fatalf("端口空闲时不应回落，实际 addr=%q", addr)
	}
	if addr != net.JoinHostPort("127.0.0.1", port) {
		t.Fatalf("应沿用配置端口且只绑回环，实际 %q", addr)
	}
}

func TestDesktopDataDirIsUnderUserDirectory(t *testing.T) {
	dir := desktopDataDir()
	if filepath.Base(dir) != "kanso" {
		t.Fatalf("数据目录应以 kanso 结尾，实际 %q", dir)
	}
	if dir == "kanso" {
		t.Fatalf("数据目录不应是裸相对路径，实际 %q", dir)
	}
}

func TestPagePreloadSkipsRejectedKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	injected, err := pagePreload(context.Background(), srv.URL, "stale")
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if injected != "" {
		t.Fatalf("服务端拒绝的密钥不应注入（否则用户会被反复挡在登录页外），实际 %q", injected)
	}

	injected, err = pagePreload(context.Background(), srv.URL, "good")
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if !strings.Contains(injected, `"good"`) {
		t.Fatalf("服务端接受的密钥应注入，实际 %q", injected)
	}
}

func TestPagePreloadInjectsWhenServerUnreachable(t *testing.T) {
	// 取一个空闲端口后立刻放开：请求必然连不上，此时按可用处理（仍注入）。
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("监听失败: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	injected, err := pagePreload(context.Background(), "http://"+addr+"/api/me", "k")
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if !strings.Contains(injected, `"k"`) {
		t.Fatalf("服务不可达时应仍注入，实际 %q", injected)
	}
}
