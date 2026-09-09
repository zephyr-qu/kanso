# 04 · login / whoami：密钥与本地配置

## 目标

校验密钥并写入 `~/.config/kanso/cli.json`（权限 `0600`）；再用 `whoami` 读 `/api/me`。

## 会改哪些文件

- [`internal/cli/config.go`](../../internal/cli/config.go)
- [`internal/cli/health.go`](../../internal/cli/health.go) 中的 login / whoami

## 要点

- 登录：`POST /api/auth/verify`，body `{"key":"..."}`。
- 密钥优先级：`--key` > `KANSO_ACCESS_KEY` > 配置文件。
- `whoami` 需要鉴权；未登录应提示先 `login`。

## 可运行命令

```bash
./kanso login --key mock-key
./kanso whoami
./kanso whoami --json
```

## 完成标准

`login` 成功后，无 `--key` 也能 `whoami`，并看到 `role=admin`（或当前成员角色）。
