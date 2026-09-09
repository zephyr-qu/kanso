package cli_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanso/internal/cli"
	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

const testKey = "test-access-key"

func startServer(t *testing.T) *httptest.Server {
	t.Helper()
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	svc := service.New(database, config.ModeTeam)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatalf("种子工作区失败: %v", err)
	}
	if err := svc.SeedAdminMember(context.Background(), testKey); err != nil {
		t.Fatalf("种子管理员失败: %v", err)
	}
	workspaces, err := svc.ListWorkspaces(context.Background())
	if err != nil || len(workspaces) == 0 {
		t.Fatalf("应有默认工作区: %v", err)
	}
	if _, err := svc.CreateProject(context.Background(), workspaces[0].ID, "默认项目"); err != nil {
		t.Fatalf("种子项目失败: %v", err)
	}
	cfg := config.Config{
		Addr:                 "127.0.0.1:0",
		AccessKey:            testKey,
		Mode:                 config.ModeTeam,
		AutoArchiveEnabled:   config.DefaultAutoArchiveEnabled,
		AutoArchiveAfterDays: config.DefaultAutoArchiveAfterDays,
	}
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc, realtime.NewHub()))
	t.Cleanup(srv.Close)
	return srv
}

func runCLI(t *testing.T, opts *cli.Options, args ...string) (string, error) {
	t.Helper()
	root, rootOpts := cli.NewRoot("test", cli.ServeAssets{})
	*rootOpts = *opts
	rootOpts.Version = "test"
	buf := &bytes.Buffer{}
	root.SetOut(buf)
	root.SetErr(buf)
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), err
}

func TestHealthNoAuth(t *testing.T) {
	srv := startServer(t)
	out, err := runCLI(t, &cli.Options{Addr: srv.URL}, "health")
	if err != nil {
		t.Fatalf("health 应成功: %v", err)
	}
	if !strings.Contains(out, "ok=true") {
		t.Fatalf("health 输出应含 ok=true，实际 %q", out)
	}
}

func TestUnauthorizedWithoutKey(t *testing.T) {
	srv := startServer(t)
	cfgPath := filepath.Join(t.TempDir(), "cli.json")
	_, err := runCLI(t, &cli.Options{Addr: srv.URL, ConfigPath: cfgPath}, "workspace", "list")
	if err == nil {
		t.Fatal("未登录应失败")
	}
	if !strings.Contains(err.Error(), "未登录") {
		t.Fatalf("错误应提示未登录，实际 %v", err)
	}
}

func TestLoginWhoamiAndLists(t *testing.T) {
	srv := startServer(t)
	cfgPath := filepath.Join(t.TempDir(), "cli.json")
	opts := &cli.Options{Addr: srv.URL, ConfigPath: cfgPath}

	out, err := runCLI(t, opts, "login", "--key", testKey)
	if err != nil {
		t.Fatalf("login 应成功: %v", err)
	}
	if !strings.Contains(out, "已登录") {
		t.Fatalf("login 输出异常: %q", out)
	}
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("应写入配置文件: %v", err)
	}
	var cfg cli.Config
	if err := json.Unmarshal(data, &cfg); err != nil || cfg.AccessKey != testKey {
		t.Fatalf("配置应保存密钥，实际 %s err=%v", data, err)
	}

	out, err = runCLI(t, opts, "whoami")
	if err != nil {
		t.Fatalf("whoami 应成功: %v", err)
	}
	if !strings.Contains(out, "role=admin") {
		t.Fatalf("whoami 应显示 admin，实际 %q", out)
	}

	out, err = runCLI(t, opts, "workspace", "list", "--json")
	if err != nil {
		t.Fatalf("workspace list 应成功: %v", err)
	}
	var workspaces []map[string]any
	if err := json.Unmarshal([]byte(out), &workspaces); err != nil || len(workspaces) == 0 {
		t.Fatalf("应返回工作区列表，实际 %q err=%v", out, err)
	}
	wsID, _ := workspaces[0]["id"].(string)

	out, err = runCLI(t, opts, "project", "list", "--workspace", wsID, "--json")
	if err != nil {
		t.Fatalf("project list 应成功: %v", err)
	}
	var projects []map[string]any
	if err := json.Unmarshal([]byte(out), &projects); err != nil || len(projects) == 0 {
		t.Fatalf("应返回项目列表，实际 %q err=%v", out, err)
	}
	projectID, _ := projects[0]["id"].(string)

	out, err = runCLI(t, opts, "board", "show", projectID, "--json")
	if err != nil {
		t.Fatalf("board show 应成功: %v", err)
	}
	var board map[string]any
	if err := json.Unmarshal([]byte(out), &board); err != nil {
		t.Fatalf("解析 board 失败: %v body=%s", err, out)
	}
	columns, _ := board["columns"].([]any)
	if len(columns) == 0 {
		t.Fatal("看板应有列")
	}
	col0, _ := columns[0].(map[string]any)
	columnID, _ := col0["id"].(string)

	out, err = runCLI(t, opts, "task", "create", "--column", columnID, "--title", "CLI任务", "--priority", "high", "--json")
	if err != nil {
		t.Fatalf("task create 应成功: %v", err)
	}
	var created map[string]any
	if err := json.Unmarshal([]byte(out), &created); err != nil {
		t.Fatalf("解析创建响应失败: %v", err)
	}
	taskID, _ := created["id"].(string)
	if taskID == "" || created["priority"] != "high" {
		t.Fatalf("创建任务异常: %v", created)
	}

	col1, _ := columns[1].(map[string]any)
	targetCol, _ := col1["id"].(string)
	out, err = runCLI(t, opts, "task", "move", taskID, "--column", targetCol, "--json")
	if err != nil {
		t.Fatalf("task move 应成功: %v", err)
	}
	var moved map[string]any
	if err := json.Unmarshal([]byte(out), &moved); err != nil {
		t.Fatalf("解析移动响应失败: %v", err)
	}
	if moved["columnId"] != targetCol {
		t.Fatalf("移动后 columnId 应为 %s，实际 %v", targetCol, moved["columnId"])
	}

	out, err = runCLI(t, opts, "task", "priority", taskID, "urgent", "--json")
	if err != nil {
		t.Fatalf("task priority 应成功: %v", err)
	}
	var updated map[string]any
	if err := json.Unmarshal([]byte(out), &updated); err != nil {
		t.Fatalf("解析优先级响应失败: %v", err)
	}
	if updated["priority"] != "urgent" {
		t.Fatalf("优先级应为 urgent，实际 %v", updated["priority"])
	}

	out, err = runCLI(t, opts, "task", "get", taskID, "--json")
	if err != nil {
		t.Fatalf("task get 应成功: %v", err)
	}
	if !strings.Contains(out, taskID) {
		t.Fatalf("详情应含任务 id，实际 %q", out)
	}

	out, err = runCLI(t, opts, "task", "update", taskID, "--title", "CLI改名", "--due", "2026-12-01", "--json")
	if err != nil {
		t.Fatalf("task update 应成功: %v", err)
	}
	var renamed map[string]any
	if err := json.Unmarshal([]byte(out), &renamed); err != nil || renamed["title"] != "CLI改名" {
		t.Fatalf("更新标题异常: %v err=%v", out, err)
	}

	out, err = runCLI(t, opts, "label", "create", "--project", projectID, "--name", "CLI标签", "--json")
	if err != nil {
		t.Fatalf("label create 应成功: %v", err)
	}
	var label map[string]any
	if err := json.Unmarshal([]byte(out), &label); err != nil {
		t.Fatalf("解析标签失败: %v", err)
	}
	labelID, _ := label["id"].(string)
	if labelID == "" {
		t.Fatal("标签应有 id")
	}

	if _, err := runCLI(t, opts, "label", "attach", taskID, labelID); err != nil {
		t.Fatalf("label attach 应成功: %v", err)
	}
	out, err = runCLI(t, opts, "label", "list", "--project", projectID, "--json")
	if err != nil {
		t.Fatalf("label list 应成功: %v", err)
	}
	var listedLabels []map[string]any
	if err := json.Unmarshal([]byte(out), &listedLabels); err != nil {
		t.Fatalf("label list --json 应为标签数组，实际 %q err=%v", out, err)
	}
	if len(listedLabels) == 0 || listedLabels[0]["name"] != "CLI标签" {
		t.Fatalf("标签列表应含 CLI标签，实际 %q", out)
	}
	if strings.Contains(out, `"columns"`) {
		t.Fatalf("label list --json 不应包含看板 columns，实际 %q", out)
	}

	if _, err := runCLI(t, opts, "task", "create", "--column", columnID, "--title", "坏优先级", "--priority", "nope"); err == nil {
		t.Fatal("非法 priority 应失败")
	}

	out, err = runCLI(t, opts, "milestone", "create", "--project", projectID, "--name", "CLI里程碑", "--due", "2026-12-31", "--json")
	if err != nil {
		t.Fatalf("milestone create 应成功: %v", err)
	}
	var milestone map[string]any
	if err := json.Unmarshal([]byte(out), &milestone); err != nil {
		t.Fatalf("解析里程碑失败: %v", err)
	}
	milestoneID, _ := milestone["id"].(string)
	if milestoneID == "" {
		t.Fatal("里程碑应有 id")
	}
	if _, err := runCLI(t, opts, "milestone", "attach", taskID, milestoneID); err != nil {
		t.Fatalf("milestone attach 应成功: %v", err)
	}
	out, err = runCLI(t, opts, "milestone", "tasks", milestoneID)
	if err != nil {
		t.Fatalf("milestone tasks 应成功: %v", err)
	}
	if !strings.Contains(out, taskID) || !strings.Contains(out, "COLUMN") {
		t.Fatalf("里程碑任务表应含任务与列名表头，实际 %q", out)
	}

	out, err = runCLI(t, opts, "task", "get", taskID)
	if err != nil {
		t.Fatalf("task get 人读输出应成功: %v", err)
	}
	if !strings.Contains(out, "CLI标签") || !strings.Contains(out, "CLI里程碑") {
		t.Fatalf("详情应含标签与里程碑，实际 %q", out)
	}

	if _, err := runCLI(t, opts, "task", "archive", taskID, "--json"); err != nil {
		t.Fatalf("task archive 应成功: %v", err)
	}
	out, err = runCLI(t, opts, "task", "archived", "--project", projectID, "--json")
	if err != nil {
		t.Fatalf("task archived 应成功: %v", err)
	}
	if !strings.Contains(out, taskID) {
		t.Fatalf("归档列表应含任务，实际 %q", out)
	}
	if _, err := runCLI(t, opts, "task", "restore", taskID, "--json"); err != nil {
		t.Fatalf("task restore 应成功: %v", err)
	}
	if _, err := runCLI(t, opts, "label", "detach", taskID, labelID); err != nil {
		t.Fatalf("label detach 应成功: %v", err)
	}
	if _, err := runCLI(t, opts, "milestone", "detach", taskID, milestoneID); err != nil {
		t.Fatalf("milestone detach 应成功: %v", err)
	}
	if _, err := runCLI(t, opts, "task", "delete", taskID); err != nil {
		t.Fatalf("task delete 应成功: %v", err)
	}
}

func TestAPIErrorBody(t *testing.T) {
	srv := startServer(t)
	c := cli.NewClient(srv.URL, "wrong-key")
	err := c.DoJSON(context.Background(), http.MethodGet, "/api/me", nil, nil)
	apiErr, ok := err.(*cli.APIError)
	if !ok {
		t.Fatalf("应为 APIError，实际 %T %v", err, err)
	}
	if apiErr.Status != http.StatusUnauthorized {
		t.Fatalf("状态应为 401，实际 %d", apiErr.Status)
	}
}
