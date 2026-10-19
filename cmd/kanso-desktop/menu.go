// 应用菜单（M6-8）：给「导出当前页为 PDF」与「检查更新」一个桌面应用的常规入口。
//
// 只加一个顶层菜单：复制粘贴、撤销这类编辑动作 WebView2 自己处理，不需要 role 菜单。
package main

import (
	"log/slog"

	"github.com/egoist/mygo"
)

// releasesURL 与前端设置页「检查更新」指向同一个地址。
const releasesURL = "https://github.com/zephyr-qu/kanso/releases/latest"

// applyMenu 安装应用菜单，须在 App.Run 之前调用。
func applyMenu(save exporter) {
	mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Label: appName, Submenu: []*mygo.MenuItem{
			{
				Label:       "导出当前页为 PDF…",
				Accelerator: "CmdOrCtrl+Shift+E",
				Click: func(_ *mygo.MenuItem, win *mygo.Window) {
					go func() {
						path, err := save.savePDF(withMainWindow(win))
						if err != nil {
							slog.Error("导出 PDF 失败", slog.Any("err", err))
							return
						}
						if path == "" {
							slog.Info("导出 PDF 已取消")
							return
						}
						slog.Info("已导出 PDF", slog.String("path", path))
					}()
				},
			},
			mygo.Separator(),
			{
				Label: "检查更新…",
				Click: func(*mygo.MenuItem, *mygo.Window) {
					if err := mygo.Shell.OpenExternal(releasesURL); err != nil {
						slog.Warn("打开更新页失败", slog.String("url", releasesURL), slog.Any("err", err))
						return
					}
					slog.Info("已在系统浏览器打开更新页", slog.String("url", releasesURL))
				},
			},
			mygo.Separator(),
			{Role: mygo.RoleQuit},
		}},
	}))
}

// withMainWindow 兜住菜单回调里拿不到窗口的情况（例如菜单属于非前台窗口）。
func withMainWindow(win *mygo.Window) *mygo.Window {
	if win != nil {
		return win
	}
	return mainWindow
}
