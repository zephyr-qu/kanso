# 12 · MCP：给 AI 代理的工具面

## 目标

在同一套 HTTP Client 上挂 `kanso mcp`（stdio），并配项目 Skill 约束代理行为。

## 会改哪些文件

- [`internal/cli/mcp.go`](../../internal/cli/mcp.go) / `mcp_task.go` / `mcp_label.go` / `mcp_milestone.go`
- [`.cursor/skills/kanso/SKILL.md`](../../.cursor/skills/kanso/SKILL.md)
- [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example)

## 要点

- 官方 SDK：`github.com/modelcontextprotocol/go-sdk/mcp`（`NewServer` + `AddTool` + `StdioTransport`）。
- 工具返回 JSON 文本，字段与 CLI `--json` 同源；**不**再 exec `kanso` 子进程。
- Skill 只写：优先 MCP、鉴权、先拿真实 ID、禁区（成员/备份/设置/serve）。
- Cursor 配置：复制 `mcp.json.example` 为本机 `.cursor/mcp.json`；密钥走 `kanso login` 或本机 env，勿提交密钥。

## 可运行命令

```bash
# 终端 1：服务
KANSO_ACCESS_KEY=mock-key go run ./cmd/kanso serve

# 终端 2：登录（可选，MCP 也可用 KANSO_ACCESS_KEY）
go build -o kanso ./cmd/kanso
./kanso login --key mock-key

# MCP 由 Cursor 拉起：kanso mcp（stdio）
# 单测不走真实 stdio：
go test ./internal/cli/ -run MCP -count=1
```

## 完成标准

`kanso mcp` 出现在 `--help`；`go test ./internal/cli/ -run MCP` 通过；Skill 与示例 mcp 配置入库。
