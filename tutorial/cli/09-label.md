# 09 · label：项目标签与贴标

## 目标

管理项目级标签，并在任务上贴上 / 撕掉。

## 会改哪些文件

- [`internal/cli/label.go`](../../internal/cli/label.go)
- [`internal/cli/root.go`](../../internal/cli/root.go)（挂上 `label`）

## 要点

| 命令 | API |
| --- | --- |
| `label list --project` | `GET /api/projects/{id}`（看板聚合里的 `labels`） |
| `label create --project --name` | `POST /api/projects/{id}/labels` |
| `label rename <id> --name` | `PATCH /api/labels/{id}` |
| `label delete <id>` | `DELETE /api/labels/{id}` |
| `label attach <task-id> <label-id>` | `POST /api/tasks/{taskId}/labels/{labelId}` |
| `label detach <task-id> <label-id>` | `DELETE /api/tasks/{taskId}/labels/{labelId}` |

只打印看板聚合里的 `labels`（`--json` 也只输出该数组，不把整块看板吐出来）。

贴标成功是 `204`，CLI 打印一行确认即可。

## 可运行命令

```bash
./kanso label create --project <project-id> --name "设计"
./kanso label list --project <project-id>
./kanso label attach <task-id> <label-id>
./kanso task get <task-id>
./kanso label detach <task-id> <label-id>
./kanso label rename <label-id> --name "前端"
./kanso label delete <label-id>
```

## 完成标准

`attach` 后 `task get` 能看到标签名；`detach` / `delete` 后关联消失。
