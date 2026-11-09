# Kanso 的开发与运维入口。`just --list` 看全部命令。
# 脚本本体在 scripts/，compose 文件在 deploy/；这里只做统一转发。

# 构建：产出内嵌前端产物的 kanso 二进制（VERSION=1.2.0 可覆写版本）
build:
    sh scripts/build.sh

# 开发：起后端 http://localhost:8080（访问密钥见日志）
serve:
    go run ./cmd/kanso serve

# 开发：前端 Vite dev server，接口代理到后端
web:
    pnpm --dir web dev

# 测试：Go 单测与 vet
test-go:
    GOCACHE="$PWD/.gocache" go test ./internal/...
    GOCACHE="$PWD/.gocache" go vet ./internal/...

# 测试：前端类型检查、单测与构建
test-web:
    pnpm --dir web typecheck && pnpm --dir web test && pnpm --dir web build

# 本地 E2E：Playwright 自动拉起后端与 Vite
e2e:
    sh scripts/e2e.sh

# 升级 Docker 部署：just upgrade --tag v0.6.1 --yes
upgrade *ARGS:
    sh scripts/upgrade.sh {{ARGS}}

# 预览落地页 http://127.0.0.1:4173
landing:
    go run ./cmd/landing

# 列出全部命令
default:
    @just --list
