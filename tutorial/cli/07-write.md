# 07 · write：创建、移动、改优先级

## 目标

覆盖任务常用写操作，全部走现有 HTTP 契约。

## 会改哪些文件

- [`internal/cli/task.go`](../../internal/cli/task.go)

## 要点

| 命令 | API |
| --- | --- |
| `task create --column --title` | `POST /api/columns/{id}/tasks` |
| `task move <id> --column [--position]` | `PATCH /api/tasks/{id}` + `columnId`（可选 `position`，默认 0） |
| `task priority <id> urgent\|high\|med\|low` | `PATCH /api/tasks/{id}` + `priority` |

优先级枚举与产品一致：`urgent` / `high` / `med` / `low`。

## 可运行命令

```bash
./kanso task create --column <column-id> --title "从 CLI 创建" --priority high
./kanso task move <task-id> --column <other-column-id>
./kanso task move <task-id> --column <other-column-id> --position 2
./kanso task priority <task-id> urgent
./kanso board show <project-id>
```

## 完成标准

创建后能在 `board show` 看到；移动与改优先级后字段更新。

下一篇：[08-task.md](08-task.md) 补 update / archive / delete。
