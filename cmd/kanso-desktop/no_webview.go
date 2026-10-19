// WebView2 缺失时的原生提示窗口（M6-6）。
//
// 桌面壳的窗口靠系统 WebView 渲染网页。Windows 10 没装 WebView2 运行时时，打包后的
// 应用既没有控制台（看不到 stderr）也没有网页可显示，只能靠 MyGo 的原生 UI 把「怎么办」
// 说清楚。这段界面由 MyGo 自己画在 GPU 上，不依赖 WebView，因此在那种机器上仍然能显示。
package main

import (
	"log/slog"
	"os"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// webView2DownloadURL 是微软官方的 WebView2 介绍与 Evergreen 运行时下载入口。
const webView2DownloadURL = "https://developer.microsoft.com/microsoft-edge/webview2/"

// 提示窗口的尺寸（DIPs）。
const (
	noWebViewWidth  = 620
	noWebViewHeight = 400
)

// forceNoWebViewEnv 让开发者在装了 WebView2 的机器上也能验证这个分支：
// KANSO_DESKTOP_FORCE_NO_WEBVIEW=1 会强制走提示窗口。
const forceNoWebViewEnv = "KANSO_DESKTOP_FORCE_NO_WEBVIEW"

// webViewAvailable 判断能否用网页窗口；设置了 forceNoWebViewEnv 时强制认为不可用。
func webViewAvailable() bool {
	if os.Getenv(forceNoWebViewEnv) != "" {
		slog.Warn("已强制走 WebView 缺失分支", slog.String("env", forceNoWebViewEnv))
		return false
	}
	return mygo.WebViewAvailable()
}

// runWithoutWebView 打开一个原生 UI 窗口说明怎么装 WebView2。
// 不启动 HTTP 服务、不打开数据库：这台机器上跑不了应用，说清楚比跑一半更合适。
func runWithoutWebView() error {
	slog.Warn("系统 WebView 不可用，改为打开原生提示窗口")
	mygo.App.WhenReady(func() {
		mygo.NewWindow(mygo.WindowOptions{
			Title:  appName,
			Width:  noWebViewWidth,
			Height: noWebViewHeight,
			Content: ui.View(func(c *ui.Context) {
				ui.Column(c).Fill().Gap(12).Padding(28).Children(func() {
					ui.Text(c, "需要 Microsoft Edge WebView2 运行时").FontSize(19).Bold()
					ui.Text(c, "Kanso 的桌面窗口由系统的 WebView2 渲染。Windows 11 自带；Windows 10 需要安装一次。").FontSize(14)
					ui.Link(c, webView2DownloadURL, webView2DownloadURL).FontSize(14)
					ui.Text(c, "装好后重新打开 Kanso 即可。数据不会丢：它们保存在本机的数据目录里。").FontSize(14)
				})
			}),
		})
	})
	return mygo.App.Run()
}
