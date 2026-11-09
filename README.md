# Kanso

轻量看板项目管理工具：Go 后端 + React 前端 + SQLite，构建后单端口运行。

## 快速开始

环境：Go 1.27.1、Node.js、pnpm。

```sh
go run ./cmd/kanso serve                        # 后端 http://localhost:8080
pnpm --dir web install && pnpm --dir web dev    # 前端另开终端，经 Vite 代理到后端
```

未设置 `KANSO_ACCESS_KEY` 时，访问密钥会打印在后端日志中。

## 构建

```sh
./build.sh                 # 构建内嵌前端的 kanso 二进制
VERSION=1.2.0 ./build.sh   # 指定版本；否则取 Git tag 或短哈希
```

## 配置

| 环境变量 | 说明 |
| --- | --- |
| `KANSO_ADDR` | 监听地址，默认 `:8080` |
| `KANSO_ACCESS_KEY` | 访问密钥；未设置时随机生成 |
| `KANSO_DATA_DIR` | SQLite 数据目录，默认 `./data` |
| `KANSO_MODE` | `personal`（默认）或 `team`，运行模式只由它决定 |
| `KANSO_WS_ORIGINS` | WebSocket 跨源白名单 |
| `KANSO_CONFIG_FILE` | 配置文件路径，默认 `./kanso-config.json` |
| `KANSO_AI_BASE_URL` | AI 捕获接口地址，默认 `https://api.openai.com/v1`（配置项 `aiBaseURL`） |
| `KANSO_AI_API_KEY` | AI 捕获 API Key（配置项 `aiAPIKey`，设置页可改，不回传明文） |
| `KANSO_AI_MODEL` | 模型名，默认 `gpt-4o-mini`（配置项 `aiModel`） |
| `KANSO_LOG_FORMAT` | `text`（默认）或 `json` |
| `KANSO_LOG_LEVEL` | `debug` / `info`（默认）/ `warn` / `error` |

AI 捕获在 Quick Capture 的 AI 页签使用，需先配置 API Key。健康检查：`GET /api/health`。

## 命令行与 MCP

`kanso serve` 起服务；`health` / `login` / `workspace` / `task` / `label` / `milestone` 通过 HTTP 操作已运行实例；`kanso mcp` 以 stdio 把同一套能力暴露给 AI 代理。

```sh
go build -o kanso ./cmd/kanso
./kanso login --key mock-key
./kanso workspace list
```

成员管理、备份与设置仍需在 Web 中操作。项目 Skill 见 [`.cursor/skills/kanso`](.cursor/skills/kanso/SKILL.md)，MCP 配置示例见 [`.cursor/mcp.json.example`](.cursor/mcp.json.example)。

## Docker

```sh
KANSO_ACCESS_KEY=your-secret-key docker compose up --build -d   # 数据在 kanso-data volume
docker compose logs -f kanso
```

升级用 `upgrade.sh`：先准备镜像（本地构建或拉已发布镜像），再停服务、备份数据卷、启动并等 `/api/ready`，失败时打印回滚与恢复命令。

```sh
sh ./upgrade.sh --dry-run            # 先看会做什么
sh ./upgrade.sh --yes                # 从当前源码重建并重启
sh ./upgrade.sh --tag v0.6.1 --yes   # 升级到已发布镜像（ghcr.io/zephyr-qu/kanso）
```

备份写到 `./backups/`（默认保留最近 5 份，可用 `--keep` / `--backup-dir` 调整）。

也可以直接用 Docker：

```sh
docker build -t kanso .
docker run --rm -p 8080:8080 -v kanso-data:/data -e KANSO_ACCESS_KEY=change-me kanso
```

## 桌面客户端（Windows）

可选入口（MyGo 壳 + WebView2，代码在 `cmd/kanso-desktop`），不影响 `serve`、CLI、MCP 与 Docker。

```sh
pnpm --dir web build                # 桌面壳内嵌 web/dist
go run ./cmd/kanso-desktop          # 开发运行
go run github.com/egoist/mygo/cmd/mygo@v0.5.5 build   # 出安装包，产物在 build/windows-amd64/
```

- **安装/数据**：装到 `%LOCALAPPDATA%\Programs\Kanso`（无需管理员，卸载用系统「应用」或 `Uninstall.exe`）；数据在 `%LOCALAPPDATA%\kanso`，卸载不删。
- **首次启动**：向导选个人/团队并确认密钥（存 Windows 凭据管理器，选择记在 `desktop.json`，删掉可重来）。
- **环境/更新**：Windows 11 自带 WebView2，Windows 10 需先装一次；安装包未签名，从 GitHub Releases 下载覆盖安装。
- `mygo build` 会覆盖被跟踪的 `web/dist/index.html`，打包后 `git checkout -- web/dist/index.html` 还原；验收清单见 [`cmd/kanso-desktop/SMOKE.md`](cmd/kanso-desktop/SMOKE.md)。

## 测试与检查

```sh
export GOCACHE="$PWD/.gocache"
go test ./internal/... && go vet ./internal/...
pnpm --dir web typecheck && pnpm --dir web test && pnpm --dir web build
```

E2E（`web/e2e`，自动拉起后端与 Vite）：

```sh
KANSO_ACCESS_KEY=e2e-key KANSO_DATA_DIR="$PWD/temp/e2e-data" \
KANSO_E2E_API_PORT=18082 KANSO_E2E_WEB_PORT=15173 \
VITE_API_TARGET=http://127.0.0.1:18082 KANSO_API_URL=http://127.0.0.1:18082 \
pnpm --dir web test:e2e
```

## 目录结构

```text
cmd/                入口：kanso（serve/CLI/mcp）、kanso-desktop、landing
internal/           后端业务代码与测试
web/src/            React 前端；web/e2e 为 Playwright 测试
apps/landing/       独立静态落地页（Cloudflare 部署，应用本身不提供）
```

落地页可独立预览：`go run ./cmd/landing`（http://127.0.0.1:4173）。截图与分享图由 `web/tools/` 下的脚本生成：`capture-landing-shots.mjs`、`build-og-card.mjs`、`build-app-icon.mjs`。
