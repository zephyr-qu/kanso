# 06 · board / task get：读看板

## 目标

按项目展示列与任务，并查看单任务详情。

## 会改哪些文件

- [`internal/cli/board.go`](../../internal/cli/board.go) 中的 `board show`
- [`internal/cli/task.go`](../../internal/cli/task.go) 中的 `task get`

## 要点

- `GET /api/projects/{id}` 返回 `{ project, columns[], labels[] }`，列内嵌 `tasks`。
- `GET /api/tasks/{id}` 返回详情包装（含 `task` 字段）。
- 表格列：`COLUMN` / `COLUMN_ID` / `TASK_ID` / `TITLE` / `PRIORITY`——后续写操作要抄 `COLUMN_ID`。

## 可运行命令

```bash
./kanso board show <project-id>
./kanso task get <task-id>
```

## 完成标准

`board show` 打印列与任务；空列也至少露出 `COLUMN_ID`。
