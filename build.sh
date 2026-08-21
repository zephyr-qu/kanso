#!/usr/bin/env sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Vite replaces the tracked go:embed placeholder with the production index.
# Keep the generated index in the binary, then restore the placeholder so a
# local release build does not leave the worktree dirty.
dist_index="$project_root/web/dist/index.html"
dist_index_backup=$(mktemp)
cp "$dist_index" "$dist_index_backup"
restore_dist_index() {
	cp "$dist_index_backup" "$dist_index"
	rm -f "$dist_index_backup"
}
trap restore_dist_index EXIT

pnpm --dir "$project_root/web" build
# 版本注入：优先取 VERSION 环境变量，否则 git tag/短哈希，兜底 dev。
version=${VERSION:-$(git -C "$project_root" describe --tags --always --dirty 2>/dev/null || echo dev)}
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${version}" -o "$project_root/kanso" "$project_root/cmd/kanso"

printf '构建完成：%s\n' "$project_root/kanso"
