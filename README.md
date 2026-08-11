# Kanso

Kanso 是个人自用的小型看板项目管理工具：Go 后端、React 前端、SQLite 单机存储、单端口运行。

## 本地开发

环境要求：Go 1.26、Node.js、pnpm。

启动后端：

```powershell
go run .
```

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
