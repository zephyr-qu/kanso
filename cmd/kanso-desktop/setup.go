// 首次启动设置（M6-9）。
//
// 桌面版此前是"静默自动登录"：启动时随机生成一把密钥、存进系统凭据存储、用 preload
// 注入页面，用户既看不到密钥也没有机会选使用方式。现在第一次启动会打开向导：选个人/团队、
// 确认或改写访问密钥；之后照旧免登录。
//
// 选择落两处：使用方式写数据目录下的 desktop.json；密钥写系统凭据存储（没有凭据存储
// 时落数据目录下的 access-key，0600）。删掉 desktop.json 会再次触发向导。
//
// 向导界面是 HTML 页面而不是 MyGo 的自绘控件（wizard.go）：它直接复用 app 编译出的样式表，
// 所以配色、字体、圆角与主界面完全一致。
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"

	"kanso/internal/config"
	"kanso/web"
)

const (
	// wizardWidth / wizardHeight 是首启向导窗口的尺寸（DIPs；UseContentSize，指页面区域）。
	wizardWidth  = 620
	wizardHeight = 660
	// wizardMinWidth / wizardMinHeight 让窗口再小也不至于把表单挤坏。
	wizardMinWidth  = 520
	wizardMinHeight = 560
	// wizardBackground 是页面绘制前的窗口底色，避免白闪；取 app 的 --semantic-surface-page
	// 并跟随系统深浅色（MyGo 支持 CSS light-dark()）。
	wizardBackground = "light-dark(#f7f5f0, #1d1b18)"
	// forceSetupEnv 强制走首启向导，便于在已配置的机器上验证这条路径。
	forceSetupEnv = "KANSO_DESKTOP_FORCE_SETUP"
	// desktopSettingsFile 是桌面壳自己的设置文件（相对数据目录）。
	desktopSettingsFile = "desktop.json"
	// mainWindowWait 是向导提交后等待主窗口出现的上限，超过就照样关闭向导。
	mainWindowWait = 15 * time.Second
)

// desktopSettings 是桌面壳自己的设置，落在数据目录下的 desktop.json。
type desktopSettings struct {
	// Mode 是运行模式：personal / team。
	Mode string `json:"mode"`
	// SetupDone 标记已经走过首启设置；文件存在也视为已设置。
	SetupDone bool `json:"setupDone"`
}

// setupResult 是首启向导里用户的选择。
type setupResult struct {
	Mode config.Mode
	Key  string
}

func desktopSettingsPath(dataDir string) string {
	return filepath.Join(dataDir, desktopSettingsFile)
}

// loadDesktopSettings 读取桌面设置；文件不存在时返回 ok=false（= 还没设置过）。
func loadDesktopSettings(dataDir string) (desktopSettings, bool, error) {
	var s desktopSettings
	b, err := os.ReadFile(desktopSettingsPath(dataDir))
	switch {
	case errors.Is(err, os.ErrNotExist):
		return s, false, nil
	case err != nil:
		return s, false, fmt.Errorf("读取 %s 失败: %w", desktopSettingsFile, err)
	}
	if err := json.Unmarshal(b, &s); err != nil {
		return s, false, fmt.Errorf("解析 %s 失败: %w", desktopSettingsFile, err)
	}
	return s, true, nil
}

// saveDesktopSettings 写入桌面设置（数据目录 0700、文件 0600）。
func saveDesktopSettings(dataDir string, s desktopSettings) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(desktopSettingsPath(dataDir), append(b, '\n'), 0o600); err != nil {
		return fmt.Errorf("写入 %s 失败: %w", desktopSettingsFile, err)
	}
	return nil
}

// applyDesktopSettings 把设置套到配置上：KANSO_MODE 环境变量仍然优先（运维/开发口径不变）。
func applyDesktopSettings(cfg *config.Config, s desktopSettings, ok bool) {
	if os.Getenv("KANSO_MODE") != "" || !ok || s.Mode == "" {
		return
	}
	cfg.Mode = config.ParseMode(s.Mode)
}

// needsSetup 判断是否要弹首启向导：
//   - KANSO_DESKTOP_FORCE_SETUP 非空 → 强制；
//   - 冒烟模式 → 不弹（自动化不能被向导卡住）；
//   - 环境变量或配置文件给了密钥 → 视为已配置，不弹；
//   - 其余情况看 desktop.json 是否存在。
func needsSetup(hasSettings, envKeyProvided bool, smokeDir string) bool {
	if os.Getenv(forceSetupEnv) != "" {
		return true
	}
	if smokeDir != "" {
		return false
	}
	return !hasSettings && !envKeyProvided
}

// persistAccessKey 把用户在向导里确认的密钥写进系统凭据存储；没有凭据存储时落文件。
func persistAccessKey(store secretStore, dataDir, key string) error {
	if setErr := store.Set(secretKey, []byte(key)); setErr == nil {
		return nil
	} else if !errors.Is(setErr, errors.ErrUnsupported) {
		slog.Warn("系统凭据写入失败，改用数据目录中的密钥文件", slog.Any("err", setErr))
	}
	return writeKeyFile(dataDir, key)
}

// completeSetup 保存向导里的选择。
func completeSetup(dataDir string, store secretStore, res setupResult) error {
	key := strings.TrimSpace(res.Key)
	if key == "" {
		return errors.New("访问密钥不能为空")
	}
	if err := saveDesktopSettings(dataDir, desktopSettings{Mode: string(res.Mode), SetupDone: true}); err != nil {
		return err
	}
	if err := persistAccessKey(store, dataDir, key); err != nil {
		return err
	}
	slog.Info("首启设置已保存", slog.String("mode", string(res.Mode)), slog.String("file", desktopSettingsPath(dataDir)))
	return nil
}

// parseSetupMode 把向导提交的模式串翻成配置里的模式；不认识的串直接拒绝（不静默回退，
// 免得打错字就悄悄变成个人版）。
func parseSetupMode(value string) (config.Mode, bool) {
	switch strings.TrimSpace(value) {
	case string(config.ModePersonal):
		return config.ModePersonal, true
	case string(config.ModeTeam):
		return config.ModeTeam, true
	default:
		return "", false
	}
}

// mustNewAccessKey 生成一把初始密钥；极端情况下返回空串，让用户在向导里自己填。
func mustNewAccessKey() string {
	key, err := newAccessKey()
	if err != nil {
		slog.Error("生成访问密钥失败，请手动填写", slog.Any("err", err))
		return ""
	}
	return key
}

// existingAccessKey 返回已经保存过的密钥，没有就返回空串（不生成新的）。
// 升级场景用：0.6.0 之前的桌面壳自动生成过一把密钥放在凭据存储里，向导应当预填它。
func existingAccessKey(store secretStore, dataDir string) string {
	if stored, err := store.Get(secretKey); err == nil && len(stored) > 0 {
		return string(stored)
	}
	key, err := readKeyFile(dataDir)
	if err != nil {
		slog.Warn("读取已有密钥失败，向导里改用新生成的密钥", slog.Any("err", err))
		return ""
	}
	return key
}

// showSetupWindow 打开首启向导。点「开始使用」后保存选择、启动服务与主窗口，
// 等主窗口出现再关掉向导——否则关掉最后一个窗口会让应用直接退出。
// initialKey 是预填的密钥（空串表示就地生成一把新的）。
func showSetupWindow(dataDir string, store secretStore, initialKey string, onDone func(setupResult)) {
	key := initialKey
	if key == "" {
		key = mustNewAccessKey()
	}
	// 页面与提交入口由只在向导期间存在的回环服务提供（wizard.go）。
	srv, err := startSetupServer(web.DistFS(), dataDir, store, key, onDone)
	if err != nil {
		slog.Error("首启向导启动失败", slog.Any("err", err))
		mygo.App.Quit()
		return
	}

	win := mygo.NewWindow(mygo.WindowOptions{
		Title:           appName + " 首次设置",
		URL:             srv.url,
		Width:           wizardWidth,
		Height:          wizardHeight,
		UseContentSize:  true,
		MinWidth:        wizardMinWidth,
		MinHeight:       wizardMinHeight,
		BackgroundColor: wizardBackground,
	})
	slog.Info("等待首启设置", slog.String("settings", desktopSettingsPath(dataDir)))

	// 提交成功 → 等主窗口接管 → 关向导 → 停掉那个临时服务。
	// 用户直接关掉向导窗口（不提交）时，进程随最后一个窗口退出，服务也跟着结束。
	go func() {
		<-srv.submitted()
		closeSetupWhenReady(win)
		srv.close()
	}()
}

// closeSetupWhenReady 等主窗口出现后再关向导，避免"关掉最后一个窗口"导致应用退出。
func closeSetupWhenReady(win *mygo.Window) {
	deadline := time.Now().Add(mainWindowWait)
	for time.Now().Before(deadline) {
		if mainWindow != nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if mainWindow == nil {
		slog.Warn("主窗口未在期限内出现，向导保持打开")
		return
	}
	win.Close()
}
