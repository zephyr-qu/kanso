# Kanso CLI 入门教程

本教程带你实现并使用 **`kanso` 命令行**：同一个二进制既可 `serve` 启动服务，也可通过 HTTP 子命令操作已运行的实例。

| 子命令 | 作用 |
| --- | --- |
| `kanso serve` | 启动 HTTP + SQLite + 前端 |
| `kanso health` / `login` / `workspace` … | 客户端：打已运行实例的 API |

刻意不做：成员管理、备份、设置（继续用 Web / API）。

## 准备

1. 启动服务（另开终端）：

```bash
KANSO_ACCESS_KEY=mock-key go run ./cmd/kanso serve
```

2. 构建：

```bash
go build -o kanso ./cmd/kanso
```

3. 按章节阅读。每篇对应一次可编译增量；仓库里的代码已是完整版，教程按「从零长出」的顺序讲解。

## 章节

| 篇 | 你会得到 |
| --- | --- |
| [01-layout.md](01-layout.md) | cobra 根命令、`serve` 与 `--help` |
| [02-health.md](02-health.md) | `health`（无密钥） |
| [03-client.md](03-client.md) | 薄 HTTP Client、错误体、退出码 |
| [04-login.md](04-login.md) | `login` / `whoami`、本地 `cli.json` |
| [05-list.md](05-list.md) | `workspace list` / `project list` |
| [06-board.md](06-board.md) | `board show` / `task get` |
| [07-write.md](07-write.md) | create / move / priority |
| [08-task.md](08-task.md) | update / archive / restore / delete |
| [09-label.md](09-label.md) | 标签 CRUD 与贴标 |
| [10-milestone.md](10-milestone.md) | 里程碑 CRUD 与关联 |
| [11-test.md](11-test.md) | `httptest` 契约测试 |

## 命令速查（完整版）

```text
kanso serve
kanso health
kanso login --key <access-key>
kanso whoami
kanso workspace list
kanso project list --workspace <id>
kanso board show <project-id>

kanso task get <id>
kanso task create --column <id> --title "..." [--priority] [--due] [--label]
kanso task update <id> [--title] [--description] [--priority] [--due] [--clear-due]
kanso task move <id> --column <id> [--position N]
kanso task priority <id> urgent|high|med|low
kanso task archive <id>
kanso task restore <id>
kanso task archived --project <id>
kanso task delete <id>

kanso label list --project <id>
kanso label create --project <id> --name "..."
kanso label rename <id> --name "..."
kanso label delete <id>
kanso label attach <task-id> <label-id>
kanso label detach <task-id> <label-id>

kanso milestone list --project <id>
kanso milestone create --project <id> --name "..." [--due]
kanso milestone update <id> [--name] [--due] [--clear-due]
kanso milestone delete <id>
kanso milestone tasks <id>
kanso milestone attach <task-id> <milestone-id>
kanso milestone detach <task-id> <milestone-id>
```

客户端全局 flag：`--addr`（默认 `http://127.0.0.1:8080`，或环境变量 `KANSO_API_URL`）、`--key`、`--json`。
