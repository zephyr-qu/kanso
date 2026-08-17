# Kanso

Kanso 是个人自用的小型看板项目管理工具：Go 后端、React 前端、SQLite 单机存储、单端口运行。

## 本地开发

环境要求：Go 1.26、Node.js、pnpm。

启动后端：

```powershell
go run .
```

嵌入式 SPA 需要 `pnpm --dir web build` 生成前端资源后再 `go run .`（未构建时 web/dist 仅含占位页）；开发模式走 Vite 开发服务器，无需预先构建。

另开终端启动前端开发服务器：

```powershell
pnpm --dir web install
pnpm --dir web dev
```

开发前端通过 Vite 代理访问 `http://localhost:8080` 的后端。未设置 `KANSO_ACCESS_KEY` 时，后端会在启动日志中打印本次访问密钥。

## Linux 生产构建

```sh
chmod +x build.sh
./build.sh
```

这会先构建 `web/dist`，再生成包含前端资源的 `kanso` 二进制。运行时可配置：

- `KANSO_ADDR`：监听地址，默认 `:8080`
- `KANSO_ACCESS_KEY`：共享访问密钥；未设置时每次启动随机生成
- `KANSO_DATA_DIR`：SQLite 数据目录，默认 `./data`
- `KANSO_MODE`：运行模式 `personal`（默认，单用户）/ `team`（多成员）；Docker 镜像默认 personal
- `KANSO_WS_ORIGINS`：WebSocket 跨源白名单（逗号分隔）；默认仅放行同源，e2e/独立前端端口需显式配置
- `KANSO_CONFIG_FILE`：配置文件路径，默认 `./kanso-config.json`；优先级为 环境变量 > 配置文件 > 默认值

运行模式**仅**由 `KANSO_MODE` 环境变量在启动时决定（不可经设置页保存）；设置页（`/settings`）可编辑并保存 `KANSO_ADDR` / `KANSO_DATA_DIR` / `KANSO_ACCESS_KEY` / `KANSO_WS_ORIGINS` 到配置文件：
监听地址、数据目录与 WS 白名单为启动参数，重启后生效；访问密钥保存时立即生效（旧密钥失效，需用新密钥登录）。
设置页另有主题切换（亮色/暗色/跟随系统，存浏览器本地）、备份导出与版本信息。
Docker 下建议 `-e KANSO_CONFIG_FILE=/data/kanso-config.json` 使配置随数据卷持久化。

二进制支持 `kanso --version`，健康检查 `GET /api/health` 返回版本号。
## Docker

```sh
docker build -t kanso .
docker run --rm -p 8080:8080 -v kanso-data:/data -e KANSO_ACCESS_KEY=change-me kanso
```

浏览器访问 `http://localhost:8080`。数据保存在 `/data/kanso.db`。

## 检查

```sh
export GOCACHE="$PWD/.gocache"
go test ./...
go vet ./...
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
```

Playwright E2E 会自动启动 Go 后端和 Vite 开发服务器；运行前设置 `KANSO_ACCESS_KEY`，例如：

```sh
export KANSO_ACCESS_KEY=e2e-key
export KANSO_DATA_DIR="$PWD/temp/e2e-data"
export KANSO_E2E_API_PORT=18082
export KANSO_E2E_WEB_PORT=15173
export VITE_API_TARGET=http://127.0.0.1:18082
export KANSO_API_URL=http://127.0.0.1:18082
pnpm --dir web test:e2e
```
