# 08 · task：更新、归档与删除

## 目标

在 create / move / priority 之外，补齐任务日常维护：改字段、归档恢复、删除。

## 会改哪些文件

- [`internal/cli/task.go`](../../internal/cli/task.go)

## 要点

| 命令 | API |
| --- | --- |
| `task update <id> --title/--description/--priority/--due/--clear-due` | `PATCH /api/tasks/{id}` |
| `task archive <id>` | `POST /api/tasks/{id}/archive` |
| `task restore <id>` | `POST /api/tasks/{id}/restore` |
| `task archived --project` | `GET /api/projects/{id}/archived-tasks` |
| `task delete <id>` | `DELETE /api/tasks/{id}` |

`create` 也可带 `--description`、`--due`、`--label`（可重复）。`get` 人读输出会带上标签与里程碑摘要。

截止日期：传 `--due YYYY-MM-DD`；清空用 `--clear-due`（请求体 `dueDate: ""`）。

## 可运行命令

```bash
./kanso task update <task-id> --title "改名" --due 2026-12-01
./kanso task archive <task-id>
./kanso task archived --project <project-id>
./kanso task restore <task-id>
./kanso task delete <task-id>
```

## 完成标准

归档后在 `task archived` 可见；恢复后回到看板；删除后 `task get` 返回 404。
