FROM node:22-alpine AS web-build

WORKDIR /src/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.26-alpine AS go-build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=web-build /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kanso .

FROM alpine:3.22

WORKDIR /app
COPY --from=go-build /out/kanso /app/kanso
VOLUME ["/data"]
ENV KANSO_ADDR=:8080
ENV KANSO_DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/app/kanso"]
