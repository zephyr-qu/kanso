# 01 · 布局：一个二进制 + cobra

## 目标

用一套 cobra 根命令挂上 `serve` 与客户端子命令，跑出 `kanso --help`。

## 会改哪些文件

- [`cmd/kanso/main.go`](../../cmd/kanso/main.go)
- [`internal/cli/root.go`](../../internal/cli/root.go)
- [`internal/cli/serve.go`](../../internal/cli/serve.go)

## 为什么用 `kanso serve`

- 以前裸跑 `kanso` 就等于启动服务；并入 CLI 后，启动约定改成显式子命令 `serve`。
- 代价很小：Docker `ENTRYPOINT`、Playwright、本地文档里把命令多写一个 `serve` 即可。
- 好处是一个二进制同时覆盖「开服务」和「调 API」，教程与日常用法一致。

## 最小代码

`main` 注入嵌入资源并交给 `cli.Execute`：

```go
if err := cli.Execute(version, cli.ServeAssets{
    SPA:     web.DistFS(),
    Landing: landing.FS(),
}); err != nil {
    fmt.Fprintln(os.Stderr, err)
    os.Exit(1)
}
```

`NewRoot` 声明全局客户端 flag（`--addr` / `--key` / `--json`），并挂上 `serve` 与各 HTTP 子命令。

## 可运行命令

```bash
go build -o kanso ./cmd/kanso
./kanso --help
./kanso --version
./kanso serve   # 另开终端启动服务时用
```

## 完成标准

`./kanso --help` 同时列出 `serve` 与 `health` 等子命令；不带参数时不自动开服务。
