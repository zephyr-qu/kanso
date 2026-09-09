# 05 · list：工作区与项目

## 目标

列出工作区，再按工作区列出项目。

## 会改哪些文件

- [`internal/cli/workspace.go`](../../internal/cli/workspace.go)
- [`internal/cli/project.go`](../../internal/cli/project.go)

## 要点

- `GET /api/workspaces`
- `GET /api/workspaces/{id}/projects`（flag `--workspace` 必填）
- 默认表格输出；`--json` 方便脚本管道。

## 可运行命令

```bash
./kanso workspace list
./kanso workspace list --json
WS=$(./kanso workspace list --json | head -c 200)   # 自行取出 id
./kanso project list --workspace <workspace-id>
```

## 完成标准

能看到至少一行工作区；用其 ID 能列出项目。
