// 外链与下载（M6-4）：应用页里的外链一律交给系统浏览器；下载落在可预期的地方。
//
// MyGo 对 window.open / target="_blank" 的默认行为已经是「http(s) 打开系统浏览器」，
// keepOnOwnPages 补上没有 target="_blank" 的普通链接：否则 WebView 会导航离开应用，
// 桌面窗口里就丢了应用本身。
package main

import (
	"log/slog"
	"net/url"
	"path/filepath"

	"github.com/egoist/mygo"
)

// keepOnOwnPages 让窗口只停留在自己服务的页面上，其它用户点击的 http(s) 链接交给系统浏览器。
func keepOnOwnPages(win *mygo.Window, addr string) {
	win.Page().OnWillNavigate(func(e *mygo.NavigateEvent) {
		if !e.UserInitiated {
			return
		}
		u, err := url.Parse(e.URL)
		if err != nil {
			return
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return
		}
		if u.Host == addr {
			return
		}
		e.PreventDefault()
		if err := mygo.Shell.OpenExternal(e.URL); err != nil {
			slog.Warn("打开系统浏览器失败", slog.String("url", e.URL), slog.Any("err", err))
			return
		}
		slog.Info("外链已交给系统浏览器", slog.String("url", e.URL))
	})
}

// handleDownloads 让下载落在可预期的地方：冒烟模式写进冒烟目录（不污染用户的下载目录），
// 正常模式沿用 MyGo 的默认（下载目录）。导出走的是 IPC（exporter.go），这里只兜住
// 页面里其它可能触发下载的情况，并把结果记进日志。
func handleDownloads(win *mygo.Window, smokeDir string) {
	win.Page().OnWillDownload(func(e *mygo.DownloadEvent) {
		if smokeDir != "" {
			e.Path = filepath.Join(smokeDir, safeFileName(e.SuggestedName))
		}
		slog.Info("页面触发下载", slog.String("url", e.URL), slog.String("path", e.Path))
	})
	win.Page().OnDownloadDone(func(d *mygo.Download) {
		if d.Err != nil {
			slog.Warn("下载失败", slog.String("path", d.Path), slog.Any("err", d.Err))
			return
		}
		slog.Info("下载完成", slog.String("path", d.Path))
	})
}
