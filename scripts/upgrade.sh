#!/usr/bin/env sh
# upgrade.sh — 一键升级 Docker 部署的 Kanso。
#
# 顺序：构建或拉取新镜像 → 停服务 → 备份数据卷 → 启动新版本 → 等待 /api/ready。
# 先准备镜像再停服务，尽量缩短不可用时间。数据库迁移只前进不回退，所以升级前一定先备份；
# 失败时脚本会打印完整的回滚命令（镜像和资料一起退回升级前的状态）。
#
# 用法：just upgrade --help（或 scripts/upgrade.sh --help）
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

compose_file=${COMPOSE_FILE:-deploy/docker-compose.yml}
case $compose_file in
/*) ;;
*) compose_file=$project_root/$compose_file ;;
esac
# compose 文件在 deploy/ 下，compose 默认只在该目录找 .env；项目的 .env 在仓库根，
# 这里显式指过去，否则变量替换会退回默认值（比如访问密钥变成 change-me）。
env_file=
if [ -f "$project_root/.env" ]; then env_file=$project_root/.env; fi
compose_hint="docker compose -f $compose_file${env_file:+ --env-file $env_file}"


service=${KANSO_SERVICE:-kanso}
container=${KANSO_CONTAINER:-kanso}
volume=${KANSO_VOLUME:-}
backup_root=${KANSO_BACKUP_DIR:-$project_root/backups}
keep_backups=5
ready_timeout=120
mode=build
target_tag=
target_image=
do_backup=1
assume_yes=0
dry_run=0

backup_file=
source_image=

usage() {
	cat <<'EOF'
升级 Docker 部署的 Kanso（默认从当前源码构建；给 --tag/--image 则改用已发布镜像）。

用法：just upgrade [选项]（直接调用：scripts/upgrade.sh [选项]）

  -b, --build              从当前源码构建镜像（默认）
  -t, --tag <tag>          拉取已发布镜像 ghcr.io/zephyr-qu/kanso:<tag>，如 v0.6.1
  -i, --image <ref>        拉取指定镜像引用，如 ghcr.io/zephyr-qu/kanso:sha-abc1234
      --no-backup          跳过升级前的数据卷备份（不推荐）
      --backup-dir <dir>   备份目录，默认 <项目根>/backups
      --keep <n>           保留最近 n 份备份，0 表示不清理，默认 5
      --timeout <秒>       等待 /api/ready 就绪的秒数，默认 120
  -y, --yes                不询问确认（非交互环境必需）
  -n, --dry-run            只打印将要执行的命令，不做任何改动
  -h, --help               显示本帮助

环境变量：
  KANSO_PORT               宿主机端口，默认 8080（也会读取 .env）
  KANSO_VOLUME             数据卷名，README 默认 kanso-data，未设置时自动探测
  KANSO_IMAGE              构建模式下的镜像名，默认 kanso:local
  KANSO_CONTAINER          容器名，默认 kanso
  KANSO_REGISTRY_IMAGE     已发布镜像名，默认 ghcr.io/zephyr-qu/kanso
  VERSION                  构建注入的版本号，默认取 git tag 或短哈希

示例：
  just upgrade                         # 拉最新代码后本地重建并重启
  just upgrade --tag v0.6.1 --yes      # 升级到已发布的 v0.6.1
  just upgrade --dry-run               # 先看会做什么
EOF
}

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf '警告：%s\n' "$*" >&2; }
die() {
	printf '错误：%s\n' "$*" >&2
	exit 1
}

need_value() {
	[ $# -ge 2 ] || die "$1 需要一个值"
}

require_number() {
	case $2 in
	'' | *[!0-9]*) die "$1 需要非负整数，收到：$2" ;;
	esac
}

while [ $# -gt 0 ]; do
	case $1 in
	-b | --build)
		mode=build
		shift
		;;
	-t | --tag)
		need_value "$@"
		target_tag=$2
		mode=pull
		shift 2
		;;
	--tag=*)
		target_tag=${1#*=}
		mode=pull
		shift
		;;
	-i | --image)
		need_value "$@"
		target_image=$2
		mode=pull
		shift 2
		;;
	--image=*)
		target_image=${1#*=}
		mode=pull
		shift
		;;
	--no-backup)
		do_backup=0
		shift
		;;
	--backup-dir)
		need_value "$@"
		backup_root=$2
		shift 2
		;;
	--keep)
		need_value "$@"
		keep_backups=$2
		shift 2
		;;
	--timeout)
		need_value "$@"
		ready_timeout=$2
		shift 2
		;;
	-y | --yes)
		assume_yes=1
		shift
		;;
	-n | --dry-run)
		dry_run=1
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		die "未知参数：$1（用 --help 查看用法）"
		;;
	esac
done

require_number --keep "$keep_backups"
require_number --timeout "$ready_timeout"

case $mode in
pull) image=${target_image:-${KANSO_REGISTRY_IMAGE:-ghcr.io/zephyr-qu/kanso}:${target_tag:-latest}} ;;
build) image=${KANSO_IMAGE:-kanso:local} ;;
esac

if [ "$mode" = build ]; then
	version=${VERSION:-$(git -C "$project_root" describe --tags --always --dirty 2>/dev/null || echo dev)}
else
	version=${VERSION:-${target_tag:-latest}}
fi

# 后续所有 compose 调用都用这一对值：compose 文件里 image 取 KANSO_IMAGE，build 的 args 取 VERSION。
KANSO_IMAGE=$image
VERSION=$version
export KANSO_IMAGE VERSION

[ -f "$compose_file" ] || die "找不到 compose 文件：$compose_file"

if [ "$dry_run" -eq 0 ]; then
	command -v docker >/dev/null 2>&1 || die "找不到 docker，请先安装 Docker Engine"
	docker compose version >/dev/null 2>&1 || die "需要 Docker Compose v2（docker compose）"
fi

run() {
	if [ "$dry_run" -eq 1 ]; then
		if [ "$1" = compose ]; then
			shift
			printf '[dry-run] %s %s\n' "$compose_hint" "$*"
		else
			printf '[dry-run] %s\n' "$*"
		fi
		return 0
	fi
	"$@"
}

compose() {
	if [ -n "$env_file" ]; then
		docker compose -f "$compose_file" --env-file "$env_file" "$@"
	else
		docker compose -f "$compose_file" "$@"
	fi
}

have_container() {
	# 只读检查，dry-run 也执行：这样预览能反映真实部署，本机没有 docker 时自然返回“无容器”。
	docker inspect "$container" >/dev/null 2>&1
}

env_value() {
	# 从项目根目录的 .env 读取变量（compose 自己也会读，这里只用于探测端口）。
	if [ -f "$project_root/.env" ]; then
		sed -n "s/^$1=//p" "$project_root/.env" | tail -n 1 | sed 's/^"//; s/"$//'
	fi
}

published_port() {
	port=
	if have_container; then
		port=$(docker port "$container" 8080/tcp 2>/dev/null | head -n 1 | sed 's/.*://')
	fi
	if [ -z "$port" ]; then
		port=$(env_value KANSO_PORT)
	fi
	printf '%s' "${port:-8080}"
}

http_body() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsS --max-time 3 "$1" 2>/dev/null
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O - --timeout=3 "$1" 2>/dev/null
	fi
}

resolve_volume() {
	[ -n "$volume" ] && return 0
	if have_container; then
		volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container" 2>/dev/null || true)
	fi
	if [ -z "$volume" ]; then
		project=${COMPOSE_PROJECT_NAME:-$(basename -- "$project_root")}
		volume=${project}_kanso-data
	fi
}

json_version() {
	sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

# ---------- 升级前状态 ----------

old_image=
old_image_id=
old_version=

if have_container; then
	old_image=$(docker inspect -f '{{.Config.Image}}' "$container")
	old_image_id=$(docker inspect -f '{{.Image}}' "$container")
	old_version=$(http_body "http://127.0.0.1:$(published_port)/api/health" | json_version || true)
fi
resolve_volume

printf '升级 Kanso（Docker）\n'
printf '  方式      %s\n' "$([ "$mode" = pull ] && echo "拉取已发布镜像" || echo "本地源码构建")"
printf '  目标镜像  %s\n' "$image"
printf '  版本      %s\n' "$version"
printf '  容器      %s\n' "$container"
printf '  数据卷    %s\n' "$volume"
if [ -n "$old_image" ]; then
	printf '  当前版本  %s（%s）\n' "${old_version:-未知}" "$old_image"
else
	printf '  当前版本  未发现容器（首次部署，或本机没有 docker）\n'
fi

if [ "$assume_yes" -eq 0 ] && [ "$dry_run" -eq 0 ]; then
	if [ ! -t 0 ]; then
		die "非交互环境请加 --yes 确认升级"
	fi
	printf '\n继续？[y/N] '
	answer=
	read -r answer || answer=
	case $answer in
	y | Y | yes | YES) ;;
	*)
		say '已取消，未做任何改动。'
		exit 0
		;;
	esac
fi

# ---------- 准备镜像（此时旧版本仍在服务） ----------

if [ "$mode" = pull ]; then
	step "拉取镜像 $image"
	run docker pull "$image" || die "拉取镜像失败：检查网络或先 docker login"
	if [ "$dry_run" -eq 0 ]; then
		docker image inspect "$image" >/dev/null 2>&1 || die "拉取后仍找不到镜像：$image"
	fi
else
	step "构建镜像 $image（VERSION=$version）"
	run compose build
fi

# ---------- 停服务并备份 ----------

if [ -n "$old_image" ]; then
	step "停止容器 $container"
	# 按容器名停，不依赖 compose 项目名（复制过 compose 文件时项目名可能不同）。
	run docker stop "$container"
fi

if [ "$do_backup" -eq 1 ] && [ -n "$old_image" ]; then
	step "备份数据卷 $volume"
	stamp=$(date +%Y%m%d-%H%M%S)
	tag_part=$(printf '%s' "${old_version:-unknown}" | tr -c 'A-Za-z0-9._-' '-')
	backup_file=$backup_root/kanso-${tag_part}-${stamp}.tar.gz
	source_image=${old_image_id:-$old_image}
	if [ "$dry_run" -eq 1 ]; then
		printf '[dry-run] mkdir -p %s\n' "$backup_root"
		printf '[dry-run] docker run --rm --network none -v "%s:/data:ro" --entrypoint tar "%s" czf - -C /data . > "%s"\n' \
			"$volume" "$source_image" "$backup_file"
	else
		mkdir -p "$backup_root"
		docker volume inspect "$volume" >/dev/null 2>&1 ||
			die "找不到数据卷 $volume，可用 KANSO_VOLUME=<卷名> 指定"
		# 用旧镜像自带的 busybox tar 打包，既不用多拉一个镜像，也不依赖宿主机 tar。
		if ! docker run --rm --network none -v "$volume:/data:ro" \
			--entrypoint tar "$source_image" czf - -C /data . >"$backup_file"; then
			rm -f "$backup_file"
			warn "备份失败，正在把旧版本启动回来"
			KANSO_IMAGE=${old_image:-$image}
			compose up -d --no-build || warn "旧版本启动失败，请手动检查"
			die "备份失败，已中止升级（数据未改动）"
		fi
		[ -s "$backup_file" ] || die "备份文件为空：$backup_file"
		printf '  备份完成 %s（%s）\n' "$backup_file" "$(du -h "$backup_file" | cut -f 1)"
		if [ "$keep_backups" -gt 0 ]; then
			ls -1t "$backup_root"/kanso-*.tar.gz 2>/dev/null |
				tail -n "+$((keep_backups + 1))" |
				while IFS= read -r stale; do
					rm -f "$stale"
					printf '  已清理旧备份 %s\n' "$(basename -- "$stale")"
				done
		fi
	fi
elif [ "$do_backup" -eq 0 ]; then
	warn "已按要求跳过备份（--no-backup）"
fi

# ---------- 启动新版本 ----------

step "启动新版本 $image"
run compose up -d --no-build

if [ "$dry_run" -eq 1 ]; then
	printf '\n[dry-run] 到此为止，未做任何改动。\n'
	exit 0
fi

# ---------- 等就绪 ----------

port=$(published_port)
url="http://127.0.0.1:$port/api/ready"
step "等待 $url 就绪（最多 ${ready_timeout} 秒）"

body=
waited=0
ready=0
while [ "$waited" -lt "$ready_timeout" ]; do
	if body=$(http_body "$url") && printf '%s' "$body" | grep -q '"ok":true'; then
		ready=1
		break
	fi
	status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo missing)
	if [ "$status" = exited ] || [ "$status" = missing ]; then
		break
	fi
	sleep 2
	waited=$((waited + 2))
	printf '.'
done
printf '\n'

if [ "$ready" -eq 1 ]; then
	new_version=$(printf '%s' "$body" | json_version)
	step '升级完成'
	printf '  版本    %s → %s\n' "${old_version:-首次部署}" "${new_version:-$version}"
	printf '  地址    http://127.0.0.1:%s\n' "$port"
	[ -n "$backup_file" ] && printf '  备份    %s\n' "$backup_file"
	printf '  日志    %s logs -f %s\n' "$compose_hint" "$service"
	exit 0
fi

status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo missing)
printf '\n升级失败：容器状态 %s，%s 始终未返回 ok。\n' "$status" "$url" >&2
printf '\n先看日志：\n  %s logs --tail=100 %s\n' "$compose_hint" "$service" >&2
printf '\n只回滚镜像（数据不动，适用于新版未改数据库的情况）：\n' >&2
printf '  KANSO_IMAGE=%s %s up -d --no-build\n' "${old_image:-$image}" "$compose_hint" >&2
if [ -n "$backup_file" ]; then
	printf '\n连数据一起回到升级前（新版已跑过迁移时用这个）：\n' >&2
	printf '  docker stop %s\n' "$container" >&2
	printf '  docker run --rm -v "%s:/data" --entrypoint sh %s -c "find /data -mindepth 1 -delete && tar xzf - -C /data" < "%s"\n' \
		"$volume" "${source_image:-$old_image}" "$backup_file" >&2
	printf '  KANSO_IMAGE=%s %s up -d --no-build\n' "${old_image:-$image}" "$compose_hint" >&2
fi
exit 1
