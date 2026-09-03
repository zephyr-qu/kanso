#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# 本地 E2E：Playwright 自动启动真后端（go run ./cmd/kanso）与 Vite dev server，
# 无需外部依赖。首次运行需 chromium：pnpm --dir web exec playwright install chromium
pnpm --dir "$project_root/web" test:e2e