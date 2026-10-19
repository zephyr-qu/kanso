// 自动化冒烟（KANSO_DESKTOP_SMOKE=<目录> 时启用，M6-4）：给页面注入 CSP 违规收集器，
// 加载完成后跑一段探针并把结果写进日志。用于在没有人工点击的情况下验证三件事：
// CSP 没有误伤应用、页面能通过 IPC 让 Go 写文件、分享卡依赖的 foreignObject→canvas→PNG 可用。
//
// 只在环境变量设置时生效，正常使用不会注入任何东西。
package main

import (
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

const smokeEnv = "KANSO_DESKTOP_SMOKE"

// smokeSettle 是加载完成后、跑探针之前的等待：让首屏数据与实时通道先起来。
const smokeSettle = 3 * time.Second

// smokeCollector 比页面脚本更早安装监听：CSP 违规只在加载期发生，晚了就收集不到。
const smokeCollector = `window.__kansoSmoke={csp:[],errors:[]};` +
	`document.addEventListener("securitypolicyviolation",function(e){` +
	`window.__kansoSmoke.csp.push({directive:e.violatedDirective,blocked:e.blockedURI});});` +
	`window.addEventListener("error",function(e){window.__kansoSmoke.errors.push(String(e.message||e));});`

// smokeProbe 是加载后执行的探针脚本：Page.Eval 会把它当作 async 函数体，所以能用 await。
const smokeProbe = `
const out = { href: location.href, state: window.__kansoSmoke || null };
// 主题接线（M6-5）：MyGo 注入的系统强调色与文字缩放，应用是否真的消费了。
const rootStyle = getComputedStyle(document.documentElement);
out.theme = {
  mygoAccent: rootStyle.getPropertyValue('--mygo-accent').trim(),
  mygoTextScale: rootStyle.getPropertyValue('--mygo-text-scale').trim(),
  ring: rootStyle.getPropertyValue('--ring').trim(),
  rootFontSize: rootStyle.fontSize,
};
document.documentElement.style.setProperty('--mygo-text-scale', '1.5');
out.theme.scaledFontSize = getComputedStyle(document.documentElement).fontSize;
document.documentElement.style.removeProperty('--mygo-text-scale');
out.theme.restoredFontSize = getComputedStyle(document.documentElement).fontSize;
try {
  out.foreignObjectPng = await new Promise((resolve, reject) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80">' +
      '<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" ' +
      'style="font:16px sans-serif;color:#111">kanso smoke</div></foreignObject></svg>';
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 240; c.height = 80;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png').slice(0, 22));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('foreignObject image failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
} catch (e) { out.foreignObjectPng = 'FAIL: ' + String(e); }
try {
  const u = URL.createObjectURL(new Blob(['smoke'], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = u; a.download = 'kanso-smoke-blob.json';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  out.blobDownload = 'clicked';
} catch (e) { out.blobDownload = 'FAIL: ' + String(e); }
try {
  out.savedPath = await window.mygo.call('` + exporterService + `.SaveFile', 'kanso-smoke-ipc.json', btoa('{"smoke":true}'));
} catch (e) { out.savedPath = 'FAIL: ' + String(e); }
return JSON.stringify(out);
`

// smokeDir 读取并准备冒烟目录；未启用时返回空串。
func smokeDir() (string, error) {
	dir := os.Getenv(smokeEnv)
	if dir == "" {
		return "", nil
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("创建冒烟目录失败: %w", err)
	}
	return dir, nil
}

// attachSmoke 在窗口第一次加载完成后跑一次探针（重复加载不重跑）。
func attachSmoke(win *mygo.Window, dir string) {
	var once sync.Once
	win.Page().OnDidFinishLoad(func() {
		once.Do(func() {
			go func() {
				time.Sleep(smokeSettle)
				result, err := win.Page().Eval(smokeProbe)
				if err != nil {
					slog.Error("冒烟探针失败", slog.Any("err", err))
					return
				}
				slog.Info("冒烟结果", slog.String("dir", dir), slog.Any("result", result))
			}()
		})
	})
}
