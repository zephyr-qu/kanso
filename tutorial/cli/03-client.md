# 03 · Client：统一 HTTP 与错误

## 目标

抽出可复用的 `Client`，让后续命令共享超时、JSON、错误体解析。

## 会改哪些文件

- [`internal/cli/client.go`](../../internal/cli/client.go)

## 要点

- `DoRaw` / `DoJSON`：可选请求体；成功 2xx 再解码。
- 非 2xx 返回 `*APIError`，尽量解析 `{"error":"..."}`。
- `Authorization: Bearer <key>` 仅在提供了密钥时设置。
- 主程序对任意 error `os.Exit(1)`——CLI 的「失败退出码」约定。

## 可运行命令

```bash
./kanso health --json
# 故意打错地址，应非零退出：
./kanso --addr http://127.0.0.1:1 health ; echo exit:$?
```

## 完成标准

错误地址时进程退出码非 0，且 stderr/返回错误可读。
