#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

pnpm --dir "$project_root/web" build
# 版本注入：优先取 VERSION 环境变量，否则 git tag/短哈希，兜底 dev。
version=${VERSION:-$(git -C "$project_root" describe --tags --always --dirty 2>/dev/null || echo dev)}
go build -trimpath -ldflags="-s -w -X main.version=${version}" -o "$project_root/kanso" "$project_root"

printf '构建完成：%s\n' "$project_root/kanso"
