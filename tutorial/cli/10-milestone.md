# 10 · milestone：里程碑与关联

## 目标

创建/更新项目里程碑，并把任务挂到里程碑上（多对多）。

## 会改哪些文件

- [`internal/cli/milestone.go`](../../internal/cli/milestone.go)
- [`internal/cli/root.go`](../../internal/cli/root.go)（挂上 `milestone`）

## 要点

| 命令 | API |
| --- | --- |
| `milestone list --project` | `GET /api/projects/{id}/milestones` |
| `milestone create --project --name [--due]` | `POST /api/projects/{id}/milestones` |
| `milestone update <id> [--name] [--due] [--clear-due]` | `PATCH /api/milestones/{id}` |
| `milestone delete <id>` | `DELETE /api/milestones/{id}` |
| `milestone tasks <id>` | `GET /api/milestones/{id}/tasks` |
| `milestone attach <task-id> <milestone-id>` | `POST /api/tasks/{taskId}/milestones/{milestoneId}` |
| `milestone detach <task-id> <milestone-id>` | `DELETE /api/tasks/{taskId}/milestones/{milestoneId}` |

`list` 人读输出含进度 `done/total`（来自聚合字段 `progress`）。

## 可运行命令

```bash
./kanso milestone create --project <project-id> --name "M1 上线" --due 2026-12-31
./kanso milestone list --project <project-id>
./kanso milestone attach <task-id> <milestone-id>
./kanso milestone tasks <milestone-id>
./kanso task get <task-id>
./kanso milestone update <milestone-id> --name "M1 发布"
./kanso milestone detach <task-id> <milestone-id>
./kanso milestone delete <milestone-id>
```

## 完成标准

关联后 `milestone tasks` 与 `task get` 都能看到对方；解除/删除后关联清空。
