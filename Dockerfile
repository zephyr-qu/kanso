# 注意：base 镜像为浮动 tag（node:22-alpine / golang:1.26-alpine / alpine:3.22）。
# 正式发布建议按 digest 锁定（--platform 下 digest 一致），保证镜像位级可复现；
# 因发布环境无 docker CLI，digest 未在此锁定——见发布审查记录。
FROM node:22-alpine AS web-build

WORKDIR /src/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.26-alpine AS go-build

# 构建时注入版本：docker build --build-arg VERSION=1.0.0
ARG VERSION=dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=web-build /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/kanso .

FROM alpine:3.22

# 非 root 运行（暴露于 :8080 的服务以最小权限执行）。
RUN addgroup -S kanso && adduser -S -G kanso kanso

WORKDIR /app
COPY --from=go-build /out/kanso /app/kanso
RUN mkdir -p /data && chown -R kanso:kanso /app /data
USER kanso
VOLUME ["/data"]
ENV KANSO_ADDR=:8080
ENV KANSO_DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/api/health | grep -q '"ok":true' || exit 1
ENTRYPOINT ["/app/kanso"]
