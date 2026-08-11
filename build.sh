#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

pnpm --dir "$project_root/web" build
go build -trimpath -ldflags='-s -w' -o "$project_root/kanso" "$project_root"

printf '构建完成：%s\n' "$project_root/kanso"
