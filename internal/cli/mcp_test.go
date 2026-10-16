package cli_test

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"kanso/internal/cli"
)

func connectMCP(t *testing.T, opts *cli.Options) *mcp.ClientSession {
	t.Helper()
	server := cli.NewMCPServerForTest(opts)
	t1, t2 := mcp.NewInMemoryTransports()
	ctx := t.Context()
	go func() {
		_ = server.Run(ctx, t1)
	}()
	client := mcp.NewClient(&mcp.Implementation{Name: "kanso-test", Version: "test"}, nil)
	session, err := client.Connect(ctx, t2, nil)
	if err != nil {
		t.Fatalf("connect MCP: %v", err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func callTool(t *testing.T, session *mcp.ClientSession, name string, args any) string {
	t.Helper()
	res, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if res.IsError {
		var parts []string
		for _, c := range res.Content {
			if tc, ok := c.(*mcp.TextContent); ok {
				parts = append(parts, tc.Text)
			}
		}
		t.Fatalf("%s tool error: %s", name, strings.Join(parts, " "))
	}
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			return tc.Text
		}
	}
	t.Fatalf("%s: empty content", name)
	return ""
}

func callToolErr(t *testing.T, session *mcp.ClientSession, name string, args any) string {
	t.Helper()
	res, err := session.CallTool(t.Context(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		return err.Error()
	}
	if !res.IsError {
		t.Fatalf("%s: expected tool error", name)
	}
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			return tc.Text
		}
	}
	return "error"
}

func TestMCPUnauthorized(t *testing.T) {
	srv := startServer(t)
	cfgPath := filepath.Join(t.TempDir(), "cli.json")
	session := connectMCP(t, &cli.Options{Addr: srv.URL, ConfigPath: cfgPath, Version: "test"})
	msg := callToolErr(t, session, "kanso_list_workspaces", map[string]any{})
	if !strings.Contains(msg, "未登录") {
		t.Fatalf("应提示未登录，实际 %q", msg)
	}
}

func TestMCPBoardCreateLabelMilestone(t *testing.T) {
	srv := startServer(t)
	cfgPath := filepath.Join(t.TempDir(), "cli.json")
	opts := &cli.Options{Addr: srv.URL, ConfigPath: cfgPath, Key: testKey, Version: "test"}
	session := connectMCP(t, opts)

	out := callTool(t, session, "kanso_health", map[string]any{})
	if !strings.Contains(out, `"ok"`) {
		t.Fatalf("health 异常: %s", out)
	}

	out = callTool(t, session, "kanso_list_workspaces", map[string]any{})
	var workspaces []map[string]any
	if err := json.Unmarshal([]byte(out), &workspaces); err != nil || len(workspaces) == 0 {
		t.Fatalf("workspaces: %s err=%v", out, err)
	}
	wsID, _ := workspaces[0]["id"].(string)

	out = callTool(t, session, "kanso_list_projects", map[string]any{"workspaceId": wsID})
	var projects []map[string]any
	if err := json.Unmarshal([]byte(out), &projects); err != nil || len(projects) == 0 {
		t.Fatalf("projects: %s err=%v", out, err)
	}
	projectID, _ := projects[0]["id"].(string)

	out = callTool(t, session, "kanso_show_board", map[string]any{"projectId": projectID})
	var board map[string]any
	if err := json.Unmarshal([]byte(out), &board); err != nil {
		t.Fatalf("board: %v", err)
	}
	columns, _ := board["columns"].([]any)
	col0, _ := columns[0].(map[string]any)
	columnID, _ := col0["id"].(string)

	msg := callToolErr(t, session, "kanso_create_task", map[string]any{
		"columnId": columnID,
		"title":    "坏优先级",
		"priority": "nope",
	})
	if !strings.Contains(msg, "urgent|high|med|low") {
		t.Fatalf("非法 priority 应失败，实际 %q", msg)
	}

	out = callTool(t, session, "kanso_create_task", map[string]any{
		"columnId": columnID,
		"title":    "MCP任务",
		"priority": "high",
	})
	var task map[string]any
	if err := json.Unmarshal([]byte(out), &task); err != nil {
		t.Fatalf("create task: %v", err)
	}
	taskID, _ := task["id"].(string)
	if taskID == "" || task["priority"] != "high" {
		t.Fatalf("create 异常: %v", task)
	}

	out = callTool(t, session, "kanso_label", map[string]any{
		"action":    "create",
		"projectId": projectID,
		"name":      "MCP标签",
	})
	var label map[string]any
	if err := json.Unmarshal([]byte(out), &label); err != nil {
		t.Fatalf("label create: %v", err)
	}
	labelID, _ := label["id"].(string)

	_ = callTool(t, session, "kanso_label", map[string]any{
		"action":  "attach",
		"taskId":  taskID,
		"labelId": labelID,
	})

	out = callTool(t, session, "kanso_label", map[string]any{
		"action":    "list",
		"projectId": projectID,
	})
	if strings.Contains(out, `"columns"`) {
		t.Fatalf("label list 不应含看板 columns: %s", out)
	}
	var labels []map[string]any
	if err := json.Unmarshal([]byte(out), &labels); err != nil || len(labels) == 0 {
		t.Fatalf("label list: %s err=%v", out, err)
	}

	out = callTool(t, session, "kanso_milestone", map[string]any{
		"action":    "create",
		"projectId": projectID,
		"name":      "MCP里程碑",
		"due":       "2026-12-31",
	})
	var milestone map[string]any
	if err := json.Unmarshal([]byte(out), &milestone); err != nil {
		t.Fatalf("milestone create: %v", err)
	}
	milestoneID, _ := milestone["id"].(string)

	_ = callTool(t, session, "kanso_milestone", map[string]any{
		"action":      "attach",
		"taskId":      taskID,
		"milestoneId": milestoneID,
	})

	out = callTool(t, session, "kanso_get_task", map[string]any{"taskId": taskID})
	if !strings.Contains(out, "MCP标签") || !strings.Contains(out, "MCP里程碑") {
		t.Fatalf("详情应含标签与里程碑: %s", out)
	}
}

// 覆盖 go-sdk v1.8.0 的两个 ServerOptions：显式能力（去掉已弃用的 logging，
// 但不得影响 tools 的自动推断）与 tools/list 的缓存提示。
func TestMCPCapabilitiesAndToolListCache(t *testing.T) {
	session := connectMCP(t, &cli.Options{
		ConfigPath: filepath.Join(t.TempDir(), "cli.json"),
		Version:    "test",
	})

	init := session.InitializeResult()
	if init == nil || init.Capabilities == nil {
		t.Fatal("缺少 initialize 结果")
	}
	// 断言的就是这个已弃用字段「没有」被声明，deprecation 提示在此处是预期的。
	if init.Capabilities.Logging != nil {
		t.Error("不应声明已弃用的 logging 能力（SEP-2577）")
	}
	if init.Capabilities.Tools == nil {
		t.Error("tools 能力应仍由 SDK 按已注册工具自动推断")
	}

	res, err := session.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if res.TTLMs != 3_600_000 {
		t.Errorf("tools/list 应带 1 小时缓存提示，实际 ttlMs=%d", res.TTLMs)
	}
	if res.CacheScope != "public" {
		t.Errorf("cacheScope 应为 public，实际 %q", res.CacheScope)
	}
	if len(res.Tools) != 18 {
		t.Errorf("工具数量应为 18，实际 %d", len(res.Tools))
	}
}
