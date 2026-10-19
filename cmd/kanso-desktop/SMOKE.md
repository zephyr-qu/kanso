# 桌面客户端 smoke 清单（Windows）

`cmd/kanso-desktop` 是 kanso 的桌面客户端入口（MyGo 壳）。设计记录在本地文档 `docs/specs/0010-m6-desktop-client.md`
（规格）与 `docs/adr/0021-desktop-client-mygo.md`（决策）——`docs/` 按仓库约定不入版本管理，克隆后本地没有。
本文件是它的验收清单：
能自动跑的先用自动化探针跑，跑不了的在真窗口里手动过一遍。

## 0. 准备

```powershell
# 前端产物必须是最新的：桌面壳内嵌的是 web/dist（构建脚本会覆盖它，见下方「注意」）
pnpm --dir web build

# 开发用二进制
go build -o kanso-desktop.exe ./cmd/kanso-desktop

# 或直接出安装包（首次会自动下载 NSIS，之后约 20 秒）
go run github.com/egoist/mygo/cmd/mygo@v0.5.5 build
# 产物：build/windows-amd64/Kanso.exe、build/windows-amd64/Kanso Setup <ver> amd64.exe
```

要求：Windows 10/11；Windows 11 自带 WebView2，Windows 10 需装 Microsoft Edge WebView2 运行时。

## 1. 自动化探针（无人值守）

`KANSO_DESKTOP_SMOKE=<目录>` 会让桌面壳注入一段探针，加载完成后自动检查并写日志：

```powershell
$env:KANSO_DESKTOP_SMOKE = "$env:TEMP\kanso-smoke"
$env:KANSO_DATA_DIR = "$env:TEMP\kanso-smoke-data"   # 不污染真实数据目录
$env:KANSO_ACCESS_KEY = "smoke-key"                  # 定死密钥，便于脚本断言
$env:GOCACHE = "$PWD\.gocache-task"

# 打包后的 exe 没有控制台，把 stderr 收进文件
$p = Start-Process .\kanso-desktop.exe -WorkingDirectory $PWD `
  -RedirectStandardError "$env:TEMP\smoke.err.log" -PassThru
Start-Sleep -Seconds 14
Get-Content "$env:TEMP\smoke.err.log" | Select-String '冒烟结果'
Stop-Process -Id $p.Id
```

`冒烟结果` 里的 `result` 应满足：

| 字段 | 期望 |
|---|---|
| `state.csp` | `[]`（CSP 无误伤） |
| `state.errors` | `[]`（无脚本错误） |
| `href` | 落在 `/w/<id>/dashboard`（已登录，未退回登录页） |
| `theme.mygoAccent` / `theme.ring` | 两者相同（焦点环跟随系统强调色） |
| `theme.scaledFontSize` | `theme.rootFontSize × 1.5`（文字缩放接线生效） |
| `foreignObjectPng` | `data:image/png;base64,`（分享卡依赖的渲染可用） |
| `blobDownload` | `clicked`，且 `<冒烟目录>` 下出现 `kanso-smoke-blob.json` |
| `savedPath` | `<冒烟目录>/kanso-smoke-ipc.json` 存在（IPC 导出可用） |
| `pdfPath` | `<冒烟目录>/kanso-*.pdf` 存在且以 `%PDF-` 开头（当前页打印成 PDF） |

日志里不应有 `status=401`。

若 `href` 停在 `/`、`theme.ring` 为空、PDF 只有几百字节：说明桌面壳内嵌的是占位 `web/dist/index.html`
（在 `pnpm --dir web build` 之前就 `go build` 了）。先构建前端，再打包/构建桌面壳。

## 2. 手动清单（只能在真窗口里点）

1. 首启免登录：删掉数据目录与凭据条目后再启动，应直接进 dashboard，不出现登录页。
2. 重启保留：关掉再开，工作区/数据/登录态都在。
3. 实时同步：同一实例开两个窗口（或用 `kanso serve` 的浏览器页面），A 改任务，B 立刻变。
4. 拖拽：看板卡片跨列/同列拖拽、列排序、键盘拖拽；日历页拖拽。
5. 导出（真点对话框）：设置 → 数据 → 导出备份，弹系统「另存为」；项目 → 分享卡 → 下载 PNG，同样弹「另存为」。
6. 外链：设置页「检查更新」与错误页的文档链接，应在系统浏览器打开，不吞在壳内。
7. 剪贴板：成员密钥的复制按钮可用（`navigator.clipboard`）。
8. `window.confirm`：设置 → 导入备份，弹确认框且能取消。
9. 单实例：重复启动 exe，只聚焦已有窗口，不新开。
10. 无 WebView2 提示：`$env:KANSO_DESKTOP_FORCE_NO_WEBVIEW = "1"` 后启动，应出现原生提示窗口（**没有** WebView2 进程、不监听 8080、不建数据库）。
11. 安装/卸载：`Kanso Setup <ver> amd64.exe /S` → 应用能从开始菜单启动 → `Uninstall.exe /S` → 安装目录、卸载项、快捷方式都清除（数据目录与 WebView 配置按设计保留）。
12. 窗口尺寸记忆：把窗口拖到别处、改个大小，正常关闭再启动，应回到那个位置和尺寸（状态记在 `%APPDATA%\Kanso\window-state.json`，正常关闭或退出时才写）。
13. 拖入导入：把一个 `kanso-backup-*.json` 从资源管理器拖进窗口，应导入并自动重载页面；拖入非 `.json` 应只记日志、不动数据。
14. 菜单：窗口菜单栏的「Kanso → 导出当前页为 PDF…」（`Ctrl+Shift+E`）应弹「另存为」并写出可读 PDF；「检查更新…」应在系统浏览器打开 releases 页。

## 3. 已知未验证

- 真机「确实没装 WebView2」的状态：只用 `KANSO_DESKTOP_FORCE_NO_WEBVIEW=1` 模拟过。
- macOS（WKWebView）与 Linux（WebKitGTK）：0.6.0 不交付，未测。
- 更新：没有签名证书，当前只能「检查更新 → 手动下载新安装包覆盖安装」，自动更新未做。

## 注意

- `mygo build` 的 `buildCommand` 会跑 `pnpm --dir web build`，从而改写被跟踪的占位文件
  `web/dist/index.html`（`go:embed` 需要它存在）。打包后请还原：
  `git checkout -- web/dist/index.html`（或 `build.sh` 那样先备份再恢复）。
- 安装包未签名：首次运行会有 SmartScreen 提示；签名需要代码签名证书（`mygo.json` 的
  `windows.certificate` + `MYGO_WINDOWS_CERTIFICATE_PASSWORD`）。
