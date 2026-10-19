// Command kanso-desktop 是 kanso 的桌面客户端入口（0.6.0 / M6）。
//
// 形态（路线 A，ADR-0021；设计文档在本地 docs/，按仓库约定不入版本管理）：进程内装配现有 kanso
// 应用（internal/app + web 内嵌 SPA），把 HTTP 服务绑在回环地址，再让 MyGo 的窗口
// 直接加载该地址。前端零改动：/api 天然同源、WebSocket 握手同源自动放行。
//
// 现有入口不受影响：kanso serve / CLI / mcp / Docker 仍是原样。
//
// 已实现（规格 0010 的 M6-1、M6-2、M6-3、M6-4）：
//   - 数据目录默认到系统用户数据目录（KANSO_DATA_DIR、配置文件仍优先）；
//   - 访问密钥只生成一次：系统凭据存储（macOS 钥匙串 / Windows 凭据管理器 /
//     Linux libsecret）优先，没有凭据存储时落数据目录的 access-key 文件（0600）；
//   - 密钥由 preload 交给页面，桌面版不弹登录页；
//   - 端口沿用配置，被占用则回落到空闲端口并打警告。
//   - 导出交给 Go 弹系统「另存为」对话框（exporter.go）；外链交给系统浏览器（links.go）；
//     静态层带 CSP（internal/httpapi/static.go）。
//   - KANSO_DESKTOP_SMOKE=<目录> 时注入无人值守冒烟探针（smoke.go）。
//   - 单实例 + 应用身份：第二次启动把命令行转交给已运行实例后退出（M6-2）。
//
// 尚未实现：打包与自动更新（M6-6、M6-7）。`mygo.json` 已就位（`main: cmd/kanso-desktop`、
// 图标 `resources/icon.png`），`mygo build` 的签名/安装器/更新配置留给 M6-6。
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/egoist/mygo"

	"kanso/internal/app"
	"kanso/internal/config"
	"kanso/internal/logx"
	"kanso/web"
)

// version 由构建时注入（-ldflags "-X main.version=..."），本地开发构建为 "dev"。
var version = "dev"

// appName 是应用身份名：单实例锁与窗口标题都用它（与 mygo.json 的 name 一致）。
const appName = "Kanso"

// mainWindow 是唯一的窗口；第二次启动时把焦点还给它（单实例，M6-2）。
var mainWindow *mygo.Window

const (
	windowWidth  = 1280
	windowHeight = 860
	// readyTimeout 是等待进程内 HTTP 服务就绪的上限；就绪后才会创建窗口。
	readyTimeout = 10 * time.Second
	readyEvery   = 50 * time.Millisecond

	// 系统凭据存储中的服务名与键。服务名固定，不跟随 app 标识，便于将来 CLI 读同一份密钥。
	secretService = "kanso"
	secretKey     = "access-key"
	// keyFileName 是系统没有凭据存储时的密钥文件（相对数据目录）。
	keyFileName = "access-key"
	// storageKey 必须与 web/src/lib/api.ts 的 KEY_STORAGE 一致。
	storageKey = "kanso.accessKey"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "kanso-desktop:", err)
		os.Exit(1)
	}
}

func run() error {
	logx.ConfigureFromEnv()

	// 版本：打包后以 mygo.json 的 version 为准（`mygo build` 不注入 -ldflags），
	// 本地 go build 没有包信息，保持 dev。
	if version == "dev" {
		if packaged := mygo.App.Version(); packaged != "" {
			version = packaged
		}
	}

	// 单实例（M6-2）：身份与版本先定下来，再抢锁。抢不到说明已有实例在跑，
	// 命令行已转交给它，本次直接退出——不碰数据库、不占端口。
	mygo.App.SetName(appName)
	mygo.App.SetVersion(version)
	if !mygo.App.RequestSingleInstanceLock() {
		slog.Info("kanso-desktop 已在运行，本次启动已退出")
		return nil
	}

	// 系统 WebView 不可用（典型是 Windows 10 没装 WebView2）时，打开一个原生 UI 提示窗口：
	// 打包后没有控制台，光往 stderr 写一行用户什么都看不到（M6-6）。
	if !webViewAvailable() {
		return runWithoutWebView()
	}

	cfg := config.LoadWithDefaultDataDir(desktopDataDir())

	addr, fellBack, err := desktopAddr(cfg.Addr)
	if err != nil {
		return err
	}
	if fellBack {
		slog.Warn("配置端口不可用，已改用空闲端口",
			slog.String("configured", cfg.Addr), slog.String("addr", addr))
	}
	cfg.Addr = addr

	if cfg.AccessKey == "" {
		key, source, err := desktopAccessKey(mygo.Secrets.Service(secretService), cfg.DataDir)
		if err != nil {
			return err
		}
		cfg.AccessKey = key
		// 只记来源，不记密钥本身。
		slog.Info("桌面壳已就绪访问密钥", slog.String("source", source))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	application, err := app.New(ctx, cfg, version, web.DistFS())
	if err != nil {
		return err
	}
	defer application.Close()

	// 复用 App.Run：它带自动归档等后台任务，也负责收到信号后的优雅关闭。
	serveErr := make(chan error, 1)
	go func() { serveErr <- application.Run(ctx) }()

	pageURL := "http://" + addr + "/"
	if err := waitForReady(ctx, pageURL+"api/health"); err != nil {
		return err
	}

	// 注入前先问服务端：只有它认的密钥才注入，免得过期密钥把用户挡在登录页外。
	preload, err := pagePreload(ctx, pageURL+"api/me", cfg.AccessKey)
	if err != nil {
		return err
	}
	dir, err := smokeDir()
	if err != nil {
		return err
	}
	if dir != "" {
		// 冒烟模式：最前面装 CSP 违规收集器（必须早于页面脚本）。
		preload = smokeCollector + preload
	}
	// 页面导出文件交给 Go 写（弹系统「另存为」），不依赖各平台 WebView 的下载行为。
	mygo.BindAs(exporterService, exporter{smokeDir: dir})

	mygo.App.WhenReady(func() {
		mainWindow = mygo.NewWindow(mygo.WindowOptions{
			Title:  "Kanso",
			URL:    pageURL,
			Width:  windowWidth,
			Height: windowHeight,
			Page: mygo.PageOptions{
				// 页面来自回环 HTTP，不是 MyGo 的「自家 origin」（只有 mygo dev 下的
				// 回环 dev server 默认可信），所以要显式信任，页面才调得到 Go。
				TrustedOrigins: []string{"http://" + addr},
				PreloadScript:  preload,
			},
		})
		keepOnOwnPages(mainWindow, addr)
		handleDownloads(mainWindow, dir)
		if dir != "" {
			attachSmoke(mainWindow, dir)
		}
	})

	// 第二次启动时把已有窗口拉回前台（单实例，M6-2）。
	mygo.App.OnSecondInstance(func(_ []string, _ string) {
		if mainWindow == nil {
			return
		}
		if mainWindow.IsMinimized() {
			mainWindow.Restore()
		}
		mainWindow.Show()
		mainWindow.Focus()
		slog.Info("第二次启动已转交到当前窗口")
	})

	if err := mygo.App.Run(); err != nil {
		return err
	}
	// 窗口全部关闭后 MyGo 的循环退出：收掉服务与数据库。
	stop()
	return <-serveErr
}

// desktopDataDir 返回桌面版的数据目录默认值：系统用户数据目录下的 kanso。
// Windows 用 %LOCALAPPDATA%（数据库不该进漫游配置），其余平台用 os.UserConfigDir
// （macOS 是 ~/Library/Application Support，Linux 是 ~/.config）。
// 仍可被 KANSO_DATA_DIR 或配置文件覆盖（见 config.LoadWithDefaultDataDir）。
func desktopDataDir() string {
	if runtime.GOOS == "windows" {
		if dir := os.Getenv("LOCALAPPDATA"); dir != "" {
			return filepath.Join(dir, "kanso")
		}
	}
	if dir, err := os.UserConfigDir(); err == nil && dir != "" {
		return filepath.Join(dir, "kanso")
	}
	// 兜底：保持 ./data 的历史口径（相对当前目录）。
	return "./data"
}

// secretStore 是系统凭据存储的一小块接口，抽出来便于单测注入替身。
type secretStore interface {
	Get(key string) ([]byte, error)
	Set(key string, value []byte) error
}

// desktopAccessKey 解析桌面壳用的访问密钥，返回密钥与来源。
// 顺序：系统凭据存储 → 数据目录里的密钥文件 → 新生成（新密钥优先存进系统凭据，
// 没有凭据存储时写文件）。
// 密钥只生成一次，所以桌面版每次打开都是同一会话，不需要登录页。
func desktopAccessKey(store secretStore, dataDir string) (key, source string, err error) {
	stored, getErr := store.Get(secretKey)
	switch {
	case getErr == nil && len(stored) > 0:
		return string(stored), "system-credential-store", nil
	case getErr != nil && !errors.Is(getErr, mygo.ErrSecretNotFound) && !errors.Is(getErr, errors.ErrUnsupported):
		slog.Warn("系统凭据读取失败，改用数据目录中的密钥文件", slog.Any("err", getErr))
	}

	fromFile, err := readKeyFile(dataDir)
	if err != nil {
		return "", "", err
	}
	if fromFile != "" {
		return fromFile, "key-file", nil
	}

	fresh, err := newAccessKey()
	if err != nil {
		return "", "", err
	}
	if setErr := store.Set(secretKey, []byte(fresh)); setErr == nil {
		return fresh, "new:system-credential-store", nil
	} else if !errors.Is(setErr, errors.ErrUnsupported) {
		slog.Warn("系统凭据写入失败，改用数据目录中的密钥文件", slog.Any("err", setErr))
	}
	if err := writeKeyFile(dataDir, fresh); err != nil {
		return "", "", err
	}
	return fresh, "new:key-file", nil
}

// newAccessKey 生成 32 字节随机密钥的十六进制表示，与 internal/app 的口径一致。
func newAccessKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("生成访问密钥失败: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func keyFilePath(dataDir string) string { return filepath.Join(dataDir, keyFileName) }

// readKeyFile 读取密钥文件；文件不存在返回空串（不是错误）。
func readKeyFile(dataDir string) (string, error) {
	b, err := os.ReadFile(keyFilePath(dataDir))
	switch {
	case errors.Is(err, os.ErrNotExist):
		return "", nil
	case err != nil:
		return "", fmt.Errorf("读取密钥文件失败: %w", err)
	}
	return strings.TrimSpace(string(b)), nil
}

// writeKeyFile 把密钥写进数据目录（0600）：系统没有凭据存储时的回退，
// 信任级别与同目录的数据库相同。
func writeKeyFile(dataDir, key string) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}
	if err := os.WriteFile(keyFilePath(dataDir), []byte(key+"\n"), 0o600); err != nil {
		return fmt.Errorf("写入密钥文件失败: %w", err)
	}
	return nil
}

// accessKeyPreload 在页面自己的脚本之前把访问密钥写进 localStorage：前端 store 初始化时
// 读的就是它（web/src/store/auth.ts），因此桌面版不弹登录页。
// 无条件覆盖页面里的旧值：调用它的 pagePreload 已向服务端确认过这把密钥可用，
// 所以页面里的旧值只可能是过期的（换过密钥，或数据来自别处）。
func accessKeyPreload(key string) (string, error) {
	// JSON 字符串字面量就是合法的 JS 字符串字面量，密钥里出现引号/反斜杠也不用特殊处理。
	quotedKey, err := json.Marshal(key)
	if err != nil {
		return "", fmt.Errorf("注入密钥失败: %w", err)
	}
	quotedStorage, err := json.Marshal(storageKey)
	if err != nil {
		return "", fmt.Errorf("注入密钥失败: %w", err)
	}
	return "try{localStorage.setItem(" + string(quotedStorage) + "," + string(quotedKey) + ");" +
		`}catch(e){console.warn("kanso: 无法写入 localStorage",e);}`, nil
}

// pagePreload 决定给页面的 preload：只有服务端承认的密钥才注入 localStorage，
// 不被承认时什么都不注入（页面里的旧值保持不动），让登录页按需出现。
// 实际上服务端每次启动都会把管理员的密钥哈希同步成启动密钥（internal/service/member.go:109），
// 所以这把密钥通常一定被接受；这一步是那层保证失效时的兜底（例如将来改成只在缺失时种子）。
// 运行中导入全量备份会把哈希换成备份里的（internal/db/gen/restore.sql.go），本次会话可能 401
// （应用会清掉本地密钥并回到登录页），重启桌面壳即重新同步回来。
func pagePreload(ctx context.Context, meURL, key string) (string, error) {
	accepted, err := accessKeyAccepted(ctx, meURL, key)
	if err != nil {
		// 连不上自己的服务（不该发生）：按可用处理，别让用户无谓地看到登录页。
		slog.Warn("校验访问密钥失败，仍注入页面", slog.Any("err", err))
		return accessKeyPreload(key)
	}
	if !accepted {
		slog.Warn("服务端未接受这把访问密钥，不注入页面：请在登录页输入可用的密钥（例如导入备份里的那把）")
		return "", nil
	}
	return accessKeyPreload(key)
}

// accessKeyAccepted 问服务端这把密钥是否可用：GET /api/me 返回 401 即不可用。
// 其它状态与网络错误都按"不可判定"处理（返回 err），由调用方决定。
func accessKeyAccepted(ctx context.Context, meURL, key string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, meURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode != http.StatusUnauthorized, nil
}

// desktopAddr 返回桌面壳要监听的地址：只绑回环。
// 端口沿用配置（默认 8080）；该端口被占用时回落一个空闲端口，fellBack 为 true。
func desktopAddr(configured string) (addr string, fellBack bool, err error) {
	if _, port, splitErr := net.SplitHostPort(configured); splitErr == nil && port != "" && port != "0" {
		preferred := net.JoinHostPort("127.0.0.1", port)
		if ln, listenErr := net.Listen("tcp", preferred); listenErr == nil {
			_ = ln.Close()
			return preferred, false, nil
		}
	}
	ln, listenErr := net.Listen("tcp", "127.0.0.1:0")
	if listenErr != nil {
		return "", false, fmt.Errorf("找不到可用的回环端口: %w", listenErr)
	}
	addr = ln.Addr().String()
	_ = ln.Close()
	return addr, true, nil
}

// waitForReady 等到健康检查返回 200，避免窗口比服务先到（页面会拿到连接被拒）。
func waitForReady(ctx context.Context, healthURL string) error {
	deadline := time.Now().Add(readyTimeout)
	client := &http.Client{Timeout: time.Second}
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err != nil {
			return err
		}
		if resp, err := client.Do(req); err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("等待 %s 就绪超时", healthURL)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(readyEvery):
		}
	}
}
