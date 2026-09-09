# 02 · health：第一个无鉴权请求

## 目标

用 `GET /api/health` 确认服务活着；不需要访问密钥。

## 会改哪些文件

- [`internal/cli/health.go`](../../internal/cli/health.go) 中的 `newHealthCmd`
- 全局 `--addr`（见 [`root.go`](../../internal/cli/root.go)）

## 要点

- 健康检查是公开接口，CLI 不应要求登录。
- 默认地址 `http://127.0.0.1:8080`；可用 `--addr` 或 `KANSO_API_URL` 覆盖。
- 人读输出形如 `ok=true name=kanso version=... mode=...`；`--json` 打印原始响应。

## 可运行命令

```bash
KANSO_ACCESS_KEY=mock-key go run ./cmd/kanso serve   # 另开终端
./kanso health
./kanso --addr http://127.0.0.1:8080 health --json
```

## 完成标准

服务已启动时，`kanso health` 输出含 `ok=true`。
