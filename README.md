# Kanso

Kanso 是一个轻量的看板项目管理工具，采用 Go 后端、React 前端和 SQLite 存储，构建后通过单端口运行。

## 项目结构

```text
cmd/kanso/          Go 应用入口（serve + CLI + mcp）
cmd/landing/        落地页独立预览服务（无配置、无数据库）
apps/landing/       独立静态落地页（自带 embed，只被服务端引用）
internal/           后端业务代码和测试（含 internal/cli）
tutorial/cli/       kanso 命令行入门教程（一步一篇）
.cursor/skills/     项目 Agent Skill（含 kanso）
web/src/            React 前端
web/e2e/            Playwright E2E 测试
Dockerfile          Docker 镜像构建文件
docker-compose.yml  Compose 部署配置
```

## 本地开发

环境要求：Go 1.26、Node.js 和 pnpm。

启动后端：

```bash
go run ./cmd/kanso serve
```

前端开发另开终端启动 Vite：

```bash
pnpm --dir web install
pnpm --dir web dev
```

前端通过 Vite 代理访问 `http://localhost:8080`。未设置 `KANSO_ACCESS_KEY` 时，访问密钥会打印在后端日志中。

落地页（`apps/landing`）与前端完全独立，可脱离后端和前端单独预览：

```bash
go run ./cmd/landing   # http://127.0.0.1:4173
```

页面里的产品截图取自真实应用：先 `pnpm --dir web build` 并起后端，再跑 `pnpm --dir web exec node tools/capture-landing-shots.mjs`，产物写入 `apps/landing/media/`。分享图另由 `pnpm --dir web exec node tools/build-og-card.mjs` 生成。

前端里的落地页入口由 `VITE_LANDING_URL` 决定，默认同源根路径 `/`。

## 本地构建

```sh
chmod +x build.sh
./build.sh
```

脚本会构建前端并生成包含前端资源的 `kanso` 二进制。版本号可通过 `VERSION` 设置，否则使用 Git tag 或短哈希。

```sh
VERSION=1.2.0 ./build.sh
./kanso --version
./kanso serve
```

运行时可配置：

- `KANSO_ADDR`：监听地址，默认 `:8080`
- `KANSO_ACCESS_KEY`：访问密钥；未设置时随机生成
- `KANSO_DATA_DIR`：SQLite 数据目录，默认 `./data`
- `KANSO_MODE`：`personal`（默认）或 `team`
- `KANSO_WS_ORIGINS`：WebSocket 跨源白名单
- `KANSO_CONFIG_FILE`：配置文件路径，默认 `./kanso-config.json`
- `KANSO_AI_BASE_URL`：AI 捕获 OpenAI 兼容接口地址，默认 `https://api.openai.com/v1`（也可写在配置文件 `aiBaseURL`）
- `KANSO_AI_API_KEY`：AI 捕获 API Key（也可写在配置文件 `aiAPIKey`；设置页可改，不回传明文）
- `KANSO_AI_MODEL`：模型名，默认 `gpt-4o-mini`（也可写在配置文件 `aiModel`）
- `KANSO_LOG_FORMAT`：日志格式，`text`（默认）或 `json`
- `KANSO_LOG_LEVEL`：日志级别，`debug` / `info`（默认）/ `warn` / `error`

运行模式仅由 `KANSO_MODE` 环境变量决定。二进制支持 `kanso --version`，健康检查接口为 `GET /api/health`。启动服务使用 `kanso serve`。AI 捕获在 Quick Capture 的 **AI** 页签中使用；需先配置 API Key。

## 命令行（kanso）

`kanso serve` 启动服务；`health` / `login` / `workspace` / `task` / `label` / `milestone` 等通过 HTTP 操作已运行实例；`kanso mcp` 以 stdio 暴露同一套能力给 AI 代理。逐步教程见 [tutorial/cli](tutorial/cli/README.md)。项目 Skill：[`.cursor/skills/kanso`](.cursor/skills/kanso/SKILL.md)。MCP 配置示例：[`.cursor/mcp.json.example`](.cursor/mcp.json.example)。不做成员管理、备份与设置（继续用 Web）。

```sh
# 终端 1：启动服务
KANSO_ACCESS_KEY=mock-key go run ./cmd/kanso serve

# 终端 2：构建并使用客户端子命令
go build -o kanso ./cmd/kanso
./kanso health
./kanso login --key mock-key
./kanso workspace list
./kanso label list --project <project-id>
./kanso milestone list --project <project-id>
# Cursor 可配置 args: ["mcp"] 拉起 MCP（密钥走 login 或本机 env）
```

## Docker 部署

使用 Docker Compose，数据保存到 `kanso-data` volume：

```sh
KANSO_ACCESS_KEY=your-secret-key docker compose up --build -d
```

访问 `http://localhost:8080`。停止服务：

```sh
docker compose down
```

也可以直接使用 Docker：

```sh
docker build -t kanso .
docker run --rm -p 8080:8080 -v kanso-data:/data -e KANSO_ACCESS_KEY=change-me kanso
```

查看日志：

```sh
docker compose logs -f kanso
```

## 测试与检查

```sh
export GOCACHE="$PWD/.gocache"
go test ./internal/...
go vet ./internal/...
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
```

Playwright E2E 测试位于 `web/e2e`，会自动启动 Go 后端和 Vite 开发服务器：

```sh
export KANSO_ACCESS_KEY=e2e-key
export KANSO_DATA_DIR="$PWD/temp/e2e-data"
export KANSO_E2E_API_PORT=18082
export KANSO_E2E_WEB_PORT=15173
export VITE_API_TARGET=http://127.0.0.1:18082
export KANSO_API_URL=http://127.0.0.1:18082
pnpm --dir web test:e2e
```
