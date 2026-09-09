# 11 · 测试：httptest 打真实路由

## 目标

不启 Vite、不启 Playwright，用临时 SQLite + 真实 router 验收 CLI。

## 会改哪些文件

- [`internal/cli/cli_test.go`](../../internal/cli/cli_test.go)

## 要点

- `httptest.NewServer(httpapi.NewRouter(...))`，种子 `SeedDefaultWorkspace` + `SeedAdminMember`。
- 覆盖：无鉴权 health、未登录提示、login 写临时 config、list/create/move/priority。
- 继续覆盖：task update/archive/restore/delete、label CRUD+贴标、milestone CRUD+关联、`--json`。
- 测试里通过 `Options.ConfigPath` 指向 `t.TempDir()`，避免污染本机 `~/.config`。

## 可运行命令

```bash
go test ./internal/cli/ -count=1
```

## 完成标准

`go test ./internal/cli/` 全部通过。
