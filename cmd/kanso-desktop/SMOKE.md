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

冒烟模式不会弹首启向导（自动化不能被向导卡住）。若 `href` 停在 `/`、`theme.ring` 为空、PDF 只有几百字节：
说明桌面壳内嵌的是占位 `web/dist/index.html`（在 `pnpm --dir web build` 之前就 `go build` 了）。
先构建前端，再打包/构建桌面壳。

## 2. 首启向导（可自动化）

全新状态（数据目录里没有 `desktop.json`、没有 `access-key`、凭据管理器里没有条目、配置文件也没给密钥）
第一次启动先弹「Kanso 首次设置」：选「个人使用 / 团队协作」、确认或改写访问密钥（默认预填一把新生成的
64 位十六进制）。**点「开始使用」之前不监听端口、不建数据库**，数据目录保持空；点完才起服务并进 dashboard。

界面是 HTML 页面而不是 MyGo 的自绘控件（`cmd/kanso-desktop/wizard.go`）：页面由只在向导期间监听的回环服务
提供，样式表直接引用 `web/dist` 里 **app 自己编译出来的那一份**，所以配色、字体、圆角与主界面完全一致，
深浅色跟随系统。窗口约 620×660 DIP。别按「系统原生控件」的观感验收——它就是一张产品页面。

两条自动化路径都实测过：

```powershell
# 前置：KANSO_DATA_DIR 指向空目录、KANSO_CONFIG_FILE 指向不存在的文件（否则配置文件里的密钥会算作已配置）
Start-Sleep -Seconds 7
$url = ([regex]::Match((Get-Content $log -Raw), 'url=(http://[0-9.:]+/)')).Groups[1].Value  # 日志里的向导地址

# (a) HTTP 直投：页面里带一次性令牌，抽出来提交即可（脚本化最省事）
$html  = (Invoke-WebRequest -Uri $url -UseBasicParsing).Content
$token = [regex]::Match($html, 'data-token="([0-9a-f]{64})"').Groups[1].Value
$key   = [regex]::Match($html, 'id="access-key"[^>]*value="([0-9a-f]{64})"').Groups[1].Value
Invoke-WebRequest -Uri ($url + "__submit") -Method POST -ContentType 'application/json' `
  -Headers @{ 'X-Kanso-Setup' = $token } -Body (@{ mode = 'team'; key = $key } | ConvertTo-Json)

# (b) 或者用 UI 自动化点真控件（WebView2 的可访问性树里能看到两个单选、密钥输入框与两个按钮）
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
$win  = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
  [System.Windows.Automation.TreeScope]::Children, $cond)          # Current.Name = "Kanso 首次设置"
$all  = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition)
$team.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
$start.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()

# 断言（两种方式一样）：desktop.json = {"mode":"team","setupDone":true}；/api/health 报 mode=team；
#   窗口标题变成 "Kanso"；用向导里那把密钥请求 /api/me 返回 200；日志无 401
```

样式是否真接上了 app：截窗口图按像素抽查——页面底色 `#f7f5f0`、卡片 `#fdfcf9`、主按钮焦橙 `#c2410c`
（截图经显示色彩配置后略有偏移，实测是 `rgb(185,66,12)`）、选中的方式卡片是橙色 9% 叠色
`rgb(242,228,219)`。这些都没有，说明 `web/dist` 里没有构建产物（启动日志 `appStyles=false`），
先 `pnpm --dir web build`。

要重新看到向导：删掉数据目录里的 `desktop.json`（并在向导里给一把服务端会接受的密钥，见下条）。
`KANSO_DESKTOP_FORCE_SETUP=1` 可以在已配置的机器上强制弹出（调试用）。

若服务端已有的密钥和向导里填的不一致：桌面壳会用 `/api/me` 校验，不接受就不注入页面，
此时界面会停在登录页——换成服务端那把密钥即可（`kanso-desktop` 启动日志会写 `source=`，但不写密钥本身）。

## 3. 手动清单（只能在真窗口里点）

1. 首启向导观感：**与主界面同一套外观**（纸色背景、焦橙主按钮、圆角卡片、思源/Plex Mono 字体），文字不溢出、两种使用方式可点、密钥输入框可编辑、「重新生成」换成另一把 64 位十六进制；系统切深色后重开，向导应跟着变暗。
2. 免登录（已配置机器）：`desktop.json` 与密钥都在时启动应直接进 dashboard，不出现登录页。
3. 重启保留：关掉再开，工作区/数据/登录态都在，不再弹向导。
4. 实时同步：同一实例开两个窗口（或用 `kanso serve` 的浏览器页面），A 改任务，B 立刻变。
5. 拖拽：看板卡片跨列/同列拖拽、列排序、键盘拖拽；日历页拖拽。
6. 导出（真点对话框）：设置 → 数据 → 导出备份，弹系统「另存为」；项目 → 分享卡 → 下载 PNG，同样弹「另存为」。
7. 外链：设置页「检查更新」与错误页的文档链接，应在系统浏览器打开，不吞在壳内。
8. 剪贴板：成员密钥的复制按钮可用（`navigator.clipboard`）。
9. `window.confirm`：设置 → 导入备份，弹确认框且能取消。
10. 单实例：重复启动 exe，只聚焦已有窗口，不新开。
11. 无 WebView2 提示：`$env:KANSO_DESKTOP_FORCE_NO_WEBVIEW = "1"` 后启动，应出现原生提示窗口（**没有** WebView2 进程、不监听 8080、不建数据库）。
12. 安装/卸载：`Kanso Setup <ver> amd64.exe /S` → 应用能从开始菜单启动 → `Uninstall.exe /S` → 安装目录、卸载项、快捷方式都清除（数据目录与 WebView 配置按设计保留）。
13. 窗口尺寸记忆：把窗口拖到别处、改个大小，正常关闭再启动，应回到那个位置和尺寸（状态记在 `%APPDATA%\Kanso\window-state.json`，正常关闭或退出时才写）。
14. 拖入导入：把一个 `kanso-backup-*.json` 从资源管理器拖进窗口，应导入并自动重载页面；拖入非 `.json` 应只记日志、不动数据。
15. 菜单：窗口菜单栏的「Kanso → 导出当前页为 PDF…」（`Ctrl+Shift+E`）应弹「另存为」并写出可读 PDF；「检查更新…」应在系统浏览器打开 releases 页。

## 4. 已知未验证

- 真机「确实没装 WebView2」的状态：只用 `KANSO_DESKTOP_FORCE_NO_WEBVIEW=1` 模拟过。
- macOS（WKWebView）与 Linux（WebKitGTK）：0.6.0 不交付，未测。
- 更新：没有签名证书，当前只能「检查更新 → 手动下载新安装包覆盖安装」，自动更新未做。
- 首启向导里的多显示器/高 DPI 观感、以及向导与主窗口同时存在的瞬间：只在本机 125% 缩放下看过。

## 注意

- `mygo build` 的 `buildCommand` 会跑 `pnpm --dir web build`，从而改写被跟踪的占位文件
  `web/dist/index.html`（`go:embed` 需要它存在）。打包后请还原：
  `git checkout -- web/dist/index.html`（或 `build.sh` 那样先备份再恢复）。
- 安装包未签名：首次运行会有 SmartScreen 提示；签名需要代码签名证书（`mygo.json` 的
  `windows.certificate` + `MYGO_WINDOWS_CERTIFICATE_PASSWORD`）。
- 首启向导会把密钥写进 Windows 凭据管理器（服务 `kanso`、键 `access-key`）。想彻底重置：
  `cmdkey /delete:kanso`，再删数据目录里的 `desktop.json` 与 `access-key`。
