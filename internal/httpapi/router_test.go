// API 缝测试（spec 唯一测试缝）：挂载真实路由 + 临时目录真实 SQLite（真实迁移与种子），
// 全部通过 HTTP 断言外部行为。唯一例外：默认列种子在 04 聚合接口落地前，用测试自有
// 临时库直接读库校验副作用（见 TestProjectSeedsDefaultColumns）。
package httpapi_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

const testKey = "test-access-key"

type testEnv struct {
	srv *httptest.Server
	db  *sql.DB
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	return newTestEnvMode(t, config.ModeTeam)
}

// do 发起带鉴权的请求，返回响应（body 为原始字节）。
func (e *testEnv) do(t *testing.T, method, path, body string) (*http.Response, []byte) {
	t.Helper()
	return e.doAuth(t, testKey, method, path, body)
}

func (e *testEnv) doAuth(t *testing.T, key, method, path, body string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, e.srv.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := e.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	defer res.Body.Close()
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 1024)
	for {
		n, rerr := res.Body.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if rerr != nil {
			break
		}
	}
	return res, buf
}

func decode[T any](t *testing.T, body []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("解析 JSON 失败: %v, body=%s", err, body)
	}
	return v
}

// TestAuthRequired 验证无密钥 / 错密钥一律 401。
func TestAuthRequired(t *testing.T) {
	e := newTestEnv(t)
	for _, tc := range []struct {
		name string
		key  string
	}{
		{name: "无密钥", key: ""},
		{name: "错误密钥", key: "wrong-key"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res, _ := e.doAuth(t, tc.key, http.MethodGet, "/api/workspaces", "")
			if res.StatusCode != http.StatusUnauthorized {
				t.Fatalf("期望 401，实际 %d", res.StatusCode)
			}
		})
	}
	res, _ := e.do(t, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("正确密钥应 200，实际 %d", res.StatusCode)
	}
}

// TestWorkspaceLifecycle 覆盖工作区列表/创建/重命名/删除。
func TestWorkspaceLifecycle(t *testing.T) {
	e := newTestEnv(t)

	// 列表：默认工作区已种子
	res, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("列表应 200，实际 %d", res.StatusCode)
	}
	ws := decode[[]map[string]any](t, body)
	if len(ws) != 1 {
		t.Fatalf("默认工作区应恰有 1 个，实际 %d", len(ws))
	}
	workspaceID := ws[0]["id"].(string)

	// 创建
	res, body = e.do(t, http.MethodPost, "/api/workspaces", `{"name":"第二个工作区"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建应 201，实际 %d", res.StatusCode)
	}
	created := decode[map[string]any](t, body)
	createdID := created["id"].(string)

	// 重命名
	res, body = e.do(t, http.MethodPatch, "/api/workspaces/"+createdID, `{"name":"改名后"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("重命名应 200，实际 %d", res.StatusCode)
	}
	if name := decode[map[string]any](t, body)["name"]; name != "改名后" {
		t.Fatalf("重命名结果错误: %v", name)
	}

	// 删除后列表回到 1 个
	if res, _ := e.do(t, http.MethodDelete, "/api/workspaces/"+createdID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/workspaces", "")
	if got := len(decode[[]map[string]any](t, body)); got != 1 {
		t.Fatalf("删除后应剩 1 个工作区，实际 %d", got)
	}

	// 删除不存在 → 404
	if res, _ := e.do(t, http.MethodDelete, "/api/workspaces/"+createdID, ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("删除不存在应 404，实际 %d", res.StatusCode)
	}

	_ = workspaceID
}

// TestProjectLifecycle 覆盖项目列表/创建/重命名/删除。
func TestProjectLifecycle(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 初始无项目
	res, body := e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/projects", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("项目列表应 200，实际 %d", res.StatusCode)
	}
	if got := len(decode[[]map[string]any](t, body)); got != 0 {
		t.Fatalf("初始应无项目，实际 %d", got)
	}
	if strings.TrimSpace(string(body)) != "[]" {
		t.Fatalf("空列表应为 [] 而非 null，实际 %s", body)
	}

	// 创建
	res, body = e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"看板项目"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建项目应 201，实际 %d", res.StatusCode)
	}
	project := decode[map[string]any](t, body)
	projectID := project["id"].(string)

	// 重命名
	res, body = e.do(t, http.MethodPatch, "/api/projects/"+projectID, `{"name":"新名字"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("重命名项目应 200，实际 %d", res.StatusCode)
	}
	if name := decode[map[string]any](t, body)["name"]; name != "新名字" {
		t.Fatalf("项目重命名结果错误: %v", name)
	}

	// 删除
	if res, _ := e.do(t, http.MethodDelete, "/api/projects/"+projectID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除项目应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/projects", "")
	if got := len(decode[[]map[string]any](t, body)); got != 0 {
		t.Fatalf("删除后应无项目，实际 %d", got)
	}
}

// TestProjectSeedsDefaultColumns 校验建项目自动种子默认列（经看板聚合接口断言）。
func TestProjectSeedsDefaultColumns(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "种子项目")

	res, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("看板聚合应 200，实际 %d", res.StatusCode)
	}
	board := decode[map[string]any](t, body)
	columns, _ := board["columns"].([]any)
	if len(columns) != 4 {
		t.Fatalf("应种子 4 个默认列，实际 %d", len(columns))
	}
}

// TestProjectJSONContract 锁定项目/工作区接口的 camelCase 键合约（前端类型见 web/src/types/*）。
// 回归：web/src/pages/workspace.tsx 中 project.createdAt.slice(0, 10) 因后端返回 created_at
// 而崩溃（Cannot read properties of undefined (reading 'slice')）。
func TestProjectJSONContract(t *testing.T) {
	e := newTestEnv(t)

	// 工作区列表应为 camelCase（前端 Workspace 类型）。
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaces := decode[[]map[string]any](t, body)
	if len(workspaces) == 0 {
		t.Fatal("应至少有一个默认工作区")
	}
	ws := workspaces[0]
	for _, key := range []string{"id", "name", "createdAt"} {
		if _, ok := ws[key]; !ok {
			t.Fatalf("工作区 JSON 缺少 %q（应为 camelCase），实际键: %v", key, jsonKeys(ws))
		}
	}
	workspaceID := ws["id"].(string)

	// 项目列表：workspace 页在 project.createdAt.slice(0, 10) 处依赖 createdAt。
	createProject(t, e, "合约项目")
	res, body := e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/projects", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("项目列表应 200，实际 %d", res.StatusCode)
	}
	projects := decode[[]map[string]any](t, body)
	if len(projects) != 1 {
		t.Fatalf("应恰有 1 个项目，实际 %d", len(projects))
	}
	p := projects[0]
	for _, key := range []string{"id", "workspaceId", "name", "position", "createdAt"} {
		if _, ok := p[key]; !ok {
			t.Fatalf("项目 JSON 缺少 %q（应为 camelCase），实际键: %v", key, jsonKeys(p))
		}
	}
}

// jsonKeys 返回 map 键的排序列表（用于断言失败时的诊断输出）。
func jsonKeys(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

// TestWorkspaceDeleteCascadesProjects 验证删除工作区级联删除项目，并保留删除审计事件。
func TestWorkspaceDeleteCascadesProjects(t *testing.T) {
	e := newTestEnv(t)

	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 新建一个临时工作区，使默认工作区不再是「最后一个」（最后一个不可删除，防 owner 级联）。
	e.do(t, http.MethodPost, "/api/workspaces", `{"name":"临时"}`)

	// 建项目 + 任务 + 评论 + 贴标签（产生 task.created/comment.created/label.attached 活动）。
	projectID := createProject(t, e, "将被级联")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"级联任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"级联评论"}`)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/labels", `{"name":"级联标签"}`)
	labelID := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, "")

	if res, _ := e.do(t, http.MethodDelete, "/api/workspaces/"+workspaceID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除工作区应 204，实际 %d", res.StatusCode)
	}

	// spec 必测：删工作区后项目/任务/评论等全部消失（无孤儿记录）。
	for _, tc := range []struct {
		table string
	}{
		{"project"}, {"column"}, {"task"}, {"comment"}, {"label"}, {"task_label"},
	} {
		var n int
		if err := e.db.QueryRow(`SELECT COUNT(*) FROM "` + tc.table + `"`).Scan(&n); err != nil {
			t.Fatalf("统计 %s 失败: %v", tc.table, err)
		}
		if n != 0 {
			t.Fatalf("级联后 %s 应无残留，实际 %d", tc.table, n)
		}
	}
	var deletedActivities int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE workspace_id = ? AND action = ?`, workspaceID, "workspace.deleted").Scan(&deletedActivities); err != nil {
		t.Fatalf("统计工作区删除活动失败: %v", err)
	}
	if deletedActivities != 1 {
		t.Fatalf("删除工作区应保留 1 条审计活动，实际 %d", deletedActivities)
	}
}

// createProject 经 API 创建工作区下的项目并返回其 ID。
func createProject(t *testing.T, e *testEnv, name string) string {
	t.Helper()
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"`+name+`"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建项目应 201，实际 %d", res.StatusCode)
	}
	return decode[map[string]any](t, body)["id"].(string)
}

// TestBoardAggregate 校验看板聚合形状：project + columns（含 tasks 数组）+ labels 数组。
// TestCreateProjectIgnoresTemplate 0008：template 参数已移除——即使请求携带 template=quadrant 也被忽略，固定种子看板默认列。
func TestCreateProjectIgnoresTemplate(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	wsID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 带 template=quadrant 的请求：行为与不带模板一致，产出看板四列。
	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+wsID+"/projects", `{"name":"带模板请求","template":"quadrant"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建项目应 201，实际 %d", res.StatusCode)
	}
	projectID := decode[map[string]any](t, body)["id"].(string)

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns, _ := decode[map[string]any](t, body)["columns"].([]any)
	if len(columns) != 4 {
		t.Fatalf("应固定 4 列，实际 %d", len(columns))
	}
	want := []string{"待办", "进行中", "已阻塞", "已完成"}
	for i, c := range columns {
		name := c.(map[string]any)["name"]
		if name != want[i] {
			t.Fatalf("列 %d 应为 %q，实际 %v", i, want[i], name)
		}
	}
}

func TestBoardAggregate(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "聚合项目")

	res, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("看板聚合应 200，实际 %d", res.StatusCode)
	}
	board := decode[map[string]any](t, body)

	if name := board["project"].(map[string]any)["name"]; name != "聚合项目" {
		t.Fatalf("project 名称错误: %v", name)
	}

	columns, _ := board["columns"].([]any)
	if len(columns) != 4 {
		t.Fatalf("应 4 列，实际 %d", len(columns))
	}
	for _, c := range columns {
		if _, ok := c.(map[string]any)["tasks"]; !ok {
			t.Fatalf("列应含 tasks 数组字段")
		}
	}

	if labels, _ := board["labels"].([]any); labels == nil {
		t.Fatalf("labels 应为数组而非 null")
	}
}

// TestColumnLifecycle 覆盖列创建（追加到末尾）/重命名/删除（含不存在 404）。
func TestColumnLifecycle(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "列管理")

	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/columns", `{"name":"新增列"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建列应 201，实际 %d", res.StatusCode)
	}
	column := decode[map[string]any](t, body)
	columnID := column["id"].(string)
	if column["position"].(float64) != 4 {
		t.Fatalf("新列应追加到 position 4，实际 %v", column["position"])
	}

	res, body = e.do(t, http.MethodPatch, "/api/columns/"+columnID, `{"name":"改名列"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("重命名列应 200，实际 %d", res.StatusCode)
	}
	if name := decode[map[string]any](t, body)["name"]; name != "改名列" {
		t.Fatalf("列重命名结果错误: %v", name)
	}

	if res, _ := e.do(t, http.MethodDelete, "/api/columns/"+columnID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除列应 204，实际 %d", res.StatusCode)
	}
	if res, _ := e.do(t, http.MethodDelete, "/api/columns/"+columnID, ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("删除不存在列应 404，实际 %d", res.StatusCode)
	}
}

// TestColumnPositionAfterDelete 回归 W-2：删除中间列（position 留洞）后新建列
// position 应取 MAX+1 而非 COUNT，避免两列同 position 都被判为末列（完成口径错乱）。
func TestColumnPositionAfterDelete(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "列位置去重")

	// 默认 4 列（position 0-3）。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns := decode[map[string]any](t, body)["columns"].([]any)
	if len(columns) != 4 {
		t.Fatalf("默认应 4 列，实际 %d", len(columns))
	}
	// 删除中间列（position 1），剩余 position 0/2/3。
	midID := columns[1].(map[string]any)["id"].(string)
	if res, _ := e.do(t, http.MethodDelete, "/api/columns/"+midID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除中间列应 204，实际 %d", res.StatusCode)
	}
	// 新建列：position 应为 MAX+1=4（COUNT=3 会与既有 position 3 冲突）。
	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/columns", `{"name":"新列"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建列应 201，实际 %d", res.StatusCode)
	}
	if pos := decode[map[string]any](t, body)["position"].(float64); pos != 4 {
		t.Fatalf("删除中间列后新列 position 应为 MAX+1=4，实际 %v", pos)
	}
	// 全量列 position 不得重复（0/2/3/4）。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	seen := map[float64]bool{}
	for _, c := range decode[map[string]any](t, body)["columns"].([]any) {
		pos := c.(map[string]any)["position"].(float64)
		if seen[pos] {
			t.Fatalf("列 position 冲突：%v 重复出现", pos)
		}
		seen[pos] = true
	}
}

// TestColumnReorder 校验列移动到目标位置后整列 reindex。
func TestColumnReorder(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "列排序")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns := decode[map[string]any](t, body)["columns"].([]any)
	firstID := columns[0].(map[string]any)["id"].(string)

	// 把第一列（待办）移到末尾。
	if res, _ := e.do(t, http.MethodPatch, "/api/columns/"+firstID, `{"position":2}`); res.StatusCode != http.StatusOK {
		t.Fatalf("移动列应 200，实际 %d", res.StatusCode)
	}

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns = decode[map[string]any](t, body)["columns"].([]any)
	names := make([]string, 0, len(columns))
	for _, c := range columns {
		names = append(names, c.(map[string]any)["name"].(string))
	}
	want := []string{"进行中", "已阻塞", "待办", "已完成"}
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("移动后顺序应为 %v，实际 %v", want, names)
	}
}

// TestTaskLifecycle 覆盖任务创建（position 分配）/更新/删除。
func TestTaskLifecycle(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "任务管理")

	// 取第一列。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns := decode[map[string]any](t, body)["columns"].([]any)
	columnID := columns[0].(map[string]any)["id"].(string)

	// 空标题 → 400。
	if res, _ := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":""}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("空标题应 400，实际 %d", res.StatusCode)
	}

	// 创建两个任务，position 依次为 0、1。
	res, body := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"任务一"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建任务应 201，实际 %d", res.StatusCode)
	}
	task1 := decode[map[string]any](t, body)
	if task1["position"].(float64) != 0 {
		t.Fatalf("首个任务 position 应为 0，实际 %v", task1["position"])
	}
	res, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"任务二"}`)
	task2 := decode[map[string]any](t, body)
	if task2["position"].(float64) != 1 {
		t.Fatalf("第二个任务 position 应为 1，实际 %v", task2["position"])
	}
	res, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"任务三"}`)
	task3 := decode[map[string]any](t, body)
	if task3["position"].(float64) != 2 {
		t.Fatalf("第三个任务 position 应为 2，实际 %v", task3["position"])
	}

	// 删除中间任务（position 1）留洞后，新任务 position 应取 MAX+1=3（不冲突）。
	if res, _ := e.do(t, http.MethodDelete, "/api/tasks/"+task2["id"].(string), ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除任务应 204，实际 %d", res.StatusCode)
	}
	res, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"任务四"}`)
	if got := decode[map[string]any](t, body)["position"].(float64); got != 3 {
		t.Fatalf("留洞后新任务 position 应为 3，实际 %v", got)
	}

	// 更新标题与描述。
	res, body = e.do(t, http.MethodPatch, "/api/tasks/"+task1["id"].(string), `{"title":"改名","description":"描述内容"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("更新任务应 200，实际 %d", res.StatusCode)
	}
	updated := decode[map[string]any](t, body)
	if updated["title"] != "改名" || updated["description"] != "描述内容" {
		t.Fatalf("更新结果错误: %v", updated)
	}

	// 看板聚合应反映任务（删掉任务二后剩 任务一/任务三/任务四 共 3 个）。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns = decode[map[string]any](t, body)["columns"].([]any)
	tasks := columns[0].(map[string]any)["tasks"].([]any)
	if len(tasks) != 3 {
		t.Fatalf("看板应含 3 个任务，实际 %d", len(tasks))
	}

	// 删除不存在 → 404。
	if res, _ := e.do(t, http.MethodDelete, "/api/tasks/nonexistent", ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("删除不存在任务应 404，实际 %d", res.StatusCode)
	}
}

func TestTaskArchiveRestoreContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "归档契约")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	res, body := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"归档任务"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建任务应 201，实际 %d", res.StatusCode)
	}
	taskID := decode[map[string]any](t, body)["id"].(string)

	res, body = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/archive", "")
	if res.StatusCode != http.StatusOK || decode[map[string]any](t, body)["archivedAt"] == nil {
		t.Fatalf("归档应返回带 archivedAt 的任务，状态 %d，body %s", res.StatusCode, body)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := len(decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)); got != 0 {
		t.Fatalf("归档任务不应出现在看板，实际 %d", got)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID+"/archived-tasks", "")
	if got := len(decode[[]map[string]any](t, body)); got != 1 {
		t.Fatalf("归档列表应有 1 个任务，实际 %d", got)
	}
	if res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/archive", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("重复归档应幂等 200，实际 %d", res.StatusCode)
	}
	res, body = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/restore", "")
	if res.StatusCode != http.StatusOK || decode[map[string]any](t, body)["archivedAt"] != nil {
		t.Fatalf("恢复应清空 archivedAt，状态 %d，body %s", res.StatusCode, body)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := len(decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)); got != 1 {
		t.Fatalf("恢复任务应回到看板，实际 %d", got)
	}
}

func TestMilestoneContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "里程碑契约")
	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/milestones", `{"name":"第一阶段","dueDate":"2026-09-01"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建里程碑应 201，实际 %d", res.StatusCode)
	}
	milestoneID := decode[map[string]any](t, body)["id"].(string)
	if res, _ = e.do(t, http.MethodGet, "/api/projects/"+projectID+"/milestones", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("列表里程碑应 200，实际 %d", res.StatusCode)
	}
	// PATCH 语义：省略 dueDate 保留现值；显式空串清空（service 保缺省，与 UpdateTask 同语义）。
	if res, body = e.do(t, http.MethodPatch, "/api/milestones/"+milestoneID, `{"name":"第一阶段-改名"}`); res.StatusCode != http.StatusOK {
		t.Fatalf("改名里程碑应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["dueDate"]; got != "2026-09-01" {
		t.Fatalf("省略 dueDate 应保留 2026-09-01，实际 %v", got)
	}
	if res, body = e.do(t, http.MethodPatch, "/api/milestones/"+milestoneID, `{"dueDate":""}`); res.StatusCode != http.StatusOK {
		t.Fatalf("清空 dueDate 应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["dueDate"]; got != nil {
		t.Fatalf("空串 dueDate 应清空为 null，实际 %v", got)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"里程碑任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	if res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/"+milestoneID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("关联里程碑应 204，实际 %d", res.StatusCode)
	}
	if res, _ = e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/milestones/"+milestoneID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("解除里程碑应 204，实际 %d", res.StatusCode)
	}
	if res, _ = e.do(t, http.MethodDelete, "/api/milestones/"+milestoneID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除里程碑应 204，实际 %d", res.StatusCode)
	}
}

// TestTaskMoveAcrossColumns 校验任务跨列移动后源/目标列 reindex。
func TestTaskMoveAcrossColumns(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "跨列移动")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns := decode[map[string]any](t, body)["columns"].([]any)
	col1 := columns[0].(map[string]any)["id"].(string)
	col2 := columns[1].(map[string]any)["id"].(string)

	// 任务一/二在 col1。
	res, body := e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务一"}`)
	task1 := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务二"}`)

	// 把任务一移到 col2 的 position 0。
	res, body = e.do(t, http.MethodPatch, "/api/tasks/"+task1, `{"columnId":"`+col2+`","position":0}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("移动任务应 200，实际 %d", res.StatusCode)
	}

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns = decode[map[string]any](t, body)["columns"].([]any)
	newCol1Tasks := columns[0].(map[string]any)["tasks"].([]any)
	newCol2Tasks := columns[1].(map[string]any)["tasks"].([]any)

	if len(newCol1Tasks) != 1 {
		t.Fatalf("源列应剩 1 个任务，实际 %d", len(newCol1Tasks))
	}
	if got := newCol1Tasks[0].(map[string]any)["title"]; got != "任务二" {
		t.Fatalf("源列剩余任务应为任务二，实际 %v", got)
	}
	if len(newCol2Tasks) != 1 || newCol2Tasks[0].(map[string]any)["title"] != "任务一" {
		t.Fatalf("目标列应含任务一，实际 %v", newCol2Tasks)
	}
	if got := newCol2Tasks[0].(map[string]any)["position"].(float64); got != 0 {
		t.Fatalf("目标列 reindex 后 position 应为 0，实际 %v", got)
	}
}

// TestTaskReorderWithinColumn 校验同列拖拽排序后 position 全量 reindex。
func TestTaskReorderWithinColumn(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "同列排序")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务A"}`)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务B"}`)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务C"}`)

	// 重查看板拿回所有任务。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	tasks := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	taskIDs := make(map[string]string, len(tasks))
	for _, t := range tasks {
		tm := t.(map[string]any)
		taskIDs[tm["title"].(string)] = tm["id"].(string)
	}

	// 把任务A（position 0）移到 position 2（末尾）。
	if res, _ := e.do(t, http.MethodPatch, "/api/tasks/"+taskIDs["任务A"], `{"position":2}`); res.StatusCode != http.StatusOK {
		t.Fatalf("同列移动应 200，实际 %d", res.StatusCode)
	}

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	tasks = decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	got := make([]string, 0, len(tasks))
	for _, item := range tasks {
		tm := item.(map[string]any)
		got = append(got, tm["title"].(string))
		if int(tm["position"].(float64)) != len(got)-1 {
			t.Fatalf("reindex 后 position 应为 %d，实际 %v", len(got)-1, tm["position"])
		}
	}
	want := []string{"任务B", "任务C", "任务A"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("移动后顺序应为 %v，实际 %v", want, got)
	}
}

// TestLabelLifecycle 覆盖项目级标签 CRUD。
func TestLabelLifecycle(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "标签项目")

	// 创建（项目级端点；0006 Phase 2）。
	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/labels", `{"name":"紧急"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建标签应 201，实际 %d", res.StatusCode)
	}
	label := decode[map[string]any](t, body)
	labelID := label["id"].(string)
	if _, ok := label["color"]; ok {
		t.Fatalf("标签响应不应包含已移除的 color 字段: %v", label)
	}
	// 标签响应应带 projectId（前端 Label 类型）。
	if label["projectId"] != projectID {
		t.Fatalf("标签应带 projectId，实际 %v", label["projectId"])
	}

	// 列表：经看板聚合返回项目标签（工作区级列表端点已移除）。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	boardLabels := decode[map[string]any](t, body)["labels"].([]any)
	if len(boardLabels) != 1 || boardLabels[0].(map[string]any)["id"] != labelID {
		t.Fatalf("看板应含刚创建的标签，实际 %v", boardLabels)
	}

	// 部分更新（只改名称）。
	res, body = e.do(t, http.MethodPatch, "/api/labels/"+labelID, `{"name":"特急"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("更新标签应 200，实际 %d", res.StatusCode)
	}
	updated := decode[map[string]any](t, body)
	if updated["name"] != "特急" {
		t.Fatalf("部分更新结果错误: %v", updated)
	}

	// 删除。
	if res, _ := e.do(t, http.MethodDelete, "/api/labels/"+labelID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除标签应 204，实际 %d", res.StatusCode)
	}
	if res, _ := e.do(t, http.MethodDelete, "/api/labels/"+labelID, ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("删除不存在标签应 404，实际 %d", res.StatusCode)
	}
}

// TestTaskLabels 覆盖贴/摘标签与看板任务携带标签。
func TestTaskLabels(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "任务标签")

	_, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/labels", `{"name":"前端"}`)
	labelID := decode[map[string]any](t, body)["id"].(string)
	// 建任务。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"带标签任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	// 贴标签。
	if res, _ := e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("贴标签应 204，实际 %d", res.StatusCode)
	}

	// 看板任务携带标签。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	tasks := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	labels := tasks[0].(map[string]any)["labels"].([]any)
	if len(labels) != 1 || labels[0].(map[string]any)["name"] != "前端" {
		t.Fatalf("任务应携带 1 个标签，实际 %v", labels)
	}

	// 摘标签。
	if res, _ := e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/labels/"+labelID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("摘标签应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	tasks = decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	if got := len(tasks[0].(map[string]any)["labels"].([]any)); got != 0 {
		t.Fatalf("摘标签后应无标签，实际 %d", got)
	}

	// 删除标签级联清除任务关联。
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, "")
	if res, _ := e.do(t, http.MethodDelete, "/api/labels/"+labelID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除标签应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	tasks = decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	if got := len(tasks[0].(map[string]any)["labels"].([]any)); got != 0 {
		t.Fatalf("删除标签后任务徽章应消失，实际 %d", got)
	}
}

// TestTaskDetail 校验任务详情聚合形状（task + labels + comments + activity 数组）。
func TestTaskDetail(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "任务详情")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	res, body := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"详情任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)

	res, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("任务详情应 200，实际 %d", res.StatusCode)
	}
	detail := decode[map[string]any](t, body)
	if detail["task"].(map[string]any)["title"] != "详情任务" {
		t.Fatalf("详情任务名错误: %v", detail["task"])
	}
	for _, key := range []string{"labels", "comments", "activity"} {
		if arr, _ := detail[key].([]any); arr == nil {
			t.Fatalf("%s 应为数组而非 null", key)
		}
	}
}

// TestCommentsAndActivity 覆盖评论 CRUD 与评论即活动。
func TestCommentsAndActivity(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "评论活动")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"评论目标"}`)
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	taskID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)[0].(map[string]any)["id"].(string)

	// 空评论 → 400。
	if res, _ := e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":""}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("空评论应 400，实际 %d", res.StatusCode)
	}

	// 发表评论。
	res, body := e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"第一条评论"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("发表评论应 201，实际 %d", res.StatusCode)
	}
	comment := decode[map[string]any](t, body)

	// 详情聚合含评论与活动（task.created + comment.created）。
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	detail := decode[map[string]any](t, body)
	comments := detail["comments"].([]any)
	if len(comments) != 1 || comments[0].(map[string]any)["content"] != "第一条评论" {
		t.Fatalf("详情评论错误: %v", comments)
	}
	// 评论作者/活动 actor 按当前成员归属（team 模式 = owner 名，ADR-0013）。
	_, meBody := e.do(t, http.MethodGet, "/api/me", "")
	ownerName := decode[map[string]any](t, meBody)["member"].(map[string]any)["name"].(string)
	if comments[0].(map[string]any)["author"] != ownerName {
		t.Fatalf("评论作者应为成员 %q，实际 %v", ownerName, comments[0])
	}
	actions := make([]string, 0)
	for _, a := range detail["activity"].([]any) {
		actions = append(actions, a.(map[string]any)["action"].(string))
	}
	hasAction := func(want string) bool {
		for _, a := range actions {
			if a == want {
				return true
			}
		}
		return false
	}
	if !hasAction("task.created") || !hasAction("comment.created") {
		t.Fatalf("活动流应含 task.created 与 comment.created，实际 %v", actions)
	}
	for _, item := range detail["activity"].([]any) {
		activity := item.(map[string]any)
		if activity["actor"] != ownerName || activity["projectName"] == "" {
			t.Fatalf("详情活动上下文不完整: %v", activity)
		}
	}

	// 删除评论。
	if res, _ := e.do(t, http.MethodDelete, "/api/comments/"+comment["id"].(string), ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除评论应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	if got := len(decode[map[string]any](t, body)["comments"].([]any)); got != 0 {
		t.Fatalf("删除后应无评论，实际 %d", got)
	}
}

// TestActivityTracksWrites 校验写操作（移动/贴标签/改名）自动记录活动。
func TestActivityTracksWrites(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "活动追踪")

	// 创建项目级标签（0006 Phase 2）。
	_, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/labels", `{"name":"标记"}`)
	labelID := decode[map[string]any](t, body)["id"].(string)

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columns := decode[map[string]any](t, body)["columns"].([]any)
	col1 := columns[0].(map[string]any)["id"].(string)
	col2 := columns[1].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务X"}`)
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	taskID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)[0].(map[string]any)["id"].(string)

	// 改名。
	e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"title":"新名字"}`)
	// 移动。
	e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"columnId":"`+col2+`","position":0}`)
	// 贴标签。
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, "")

	// 活动流应含 task.updated / task.moved / label.attached，且按时间倒序。
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	activity := decode[map[string]any](t, body)["activity"].([]any)
	hasAction := func(want string) bool {
		for _, a := range activity {
			if a.(map[string]any)["action"].(string) == want {
				return true
			}
		}
		return false
	}
	for _, want := range []string{"task.updated", "task.moved", "label.attached"} {
		if !hasAction(want) {
			t.Fatalf("活动流应含 %s，实际 %v", want, activity)
		}
	}
	// 倒序：最后一条应是 label.attached。
	last := activity[0].(map[string]any)["action"].(string)
	if last != "label.attached" {
		t.Fatalf("活动流应按时间倒序，最新应为 label.attached，实际 %s", last)
	}
}

// TestRealtimeBroadcast 校验 WS 广播与项目隔离。
func TestRealtimeBroadcast(t *testing.T) {
	e := newTestEnv(t)
	project1 := createProject(t, e, "实时项目一")
	project2 := createProject(t, e, "实时项目二")

	// 订阅 project1。
	wsURL := "ws" + strings.TrimPrefix(e.srv.URL, "http") + "/api/ws?project=" + project1 + "&key=" + testKey
	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("WS 连接失败: %v", err)
	}
	defer conn.CloseNow()
	// 等待服务端完成订阅（Dial 返回与 handler Subscribe 之间存在竞态窗口）。
	time.Sleep(200 * time.Millisecond)

	// project1 建任务 → 应收到 task.created 事件。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+project1, "")
	column1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+column1+"/tasks", `{"title":"同步任务"}`)

	readCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, data, err := conn.Read(readCtx)
	if err != nil {
		t.Fatalf("读取事件失败: %v", err)
	}
	var event realtime.Event
	if err := json.Unmarshal(data, &event); err != nil {
		t.Fatalf("解析事件失败: %v", err)
	}
	if event.Type != "task.created" || event.ProjectID != project1 {
		t.Fatalf("期望 task.created 事件（project=%s），实际 %+v", project1, event)
	}

	// 项目隔离：project2 建任务，project1 的连接不应收到事件。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+project2, "")
	column2 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+column2+"/tasks", `{"title":"隔离任务"}`)

	isolationCtx, cancel2 := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel2()
	if _, _, err := conn.Read(isolationCtx); err == nil {
		t.Fatalf("项目隔离失败：跨项目事件被收到")
	}
}

// TestRealtimeAuth 校验 WS 端点鉴权（错误密钥被拒绝）。
func TestRealtimeAuth(t *testing.T) {
	e := newTestEnv(t)
	project1 := createProject(t, e, "鉴权项目")
	wsURL := "ws" + strings.TrimPrefix(e.srv.URL, "http") + "/api/ws?project=" + project1 + "&key=wrong-key"
	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err == nil {
		conn.CloseNow()
		t.Fatalf("错误密钥应拒绝 WS 连接")
	}
}

// TestWSOriginPolicy 回归 W-5：WS 升级仅放行 无 Origin / 同源 / 白名单 Origin。
// httptest 无 Origin 头（websocket.Dial 默认不携带）已由既有 WS 测试覆盖（放行分支）；
// 这里覆盖同源、白名单放行与未授权 Origin 拒绝。
func TestWSOriginPolicy(t *testing.T) {
	e := newTestEnvModeOrigins(t, config.ModeTeam, []string{"http://allowed.example"})
	project1 := createProject(t, e, "来源校验项目")
	wsURL := "ws" + strings.TrimPrefix(e.srv.URL, "http") + "/api/ws?project=" + project1 + "&key=" + testKey
	ctx := context.Background()

	dial := func(origin string) (*websocket.Conn, *http.Response, error) {
		opts := (*websocket.DialOptions)(nil)
		if origin != "" {
			opts = &websocket.DialOptions{
				HTTPHeader: http.Header{"Origin": []string{origin}},
			}
		}
		return websocket.Dial(ctx, wsURL, opts)
	}

	t.Run("同源 Origin 放行", func(t *testing.T) {
		conn, _, err := dial(e.srv.URL) // Origin host 与请求 Host 一致。
		if err != nil {
			t.Fatalf("同源连接应成功: %v", err)
		}
		conn.CloseNow()
	})
	t.Run("白名单 Origin 放行", func(t *testing.T) {
		conn, _, err := dial("http://allowed.example")
		if err != nil {
			t.Fatalf("白名单连接应成功: %v", err)
		}
		conn.CloseNow()
	})
	t.Run("未授权 Origin 拒绝", func(t *testing.T) {
		conn, _, err := dial("http://evil.example")
		if err == nil {
			conn.CloseNow()
			t.Fatalf("未授权 Origin 应拒绝连接")
		}
	})
	t.Run("无 Origin（非浏览器客户端）放行", func(t *testing.T) {
		conn, _, err := dial("")
		if err != nil {
			t.Fatalf("无 Origin 连接应成功: %v", err)
		}
		conn.CloseNow()
	})
}

// TestHealthAndVerify 覆盖健康检查与登录验证端点（此前 0%）。
func TestHealthAndVerify(t *testing.T) {
	e := newTestEnv(t)

	// /api/health 无需鉴权。
	res, body := e.doAuth(t, "", http.MethodGet, "/api/health", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("health 应 200，实际 %d", res.StatusCode)
	}
	if ok := decode[map[string]any](t, body)["ok"]; ok != true {
		t.Fatalf("health 应返回 ok:true，实际 %v", ok)
	}

	// /api/ready 无需鉴权，并检查数据库连接可用。
	res, body = e.doAuth(t, "", http.MethodGet, "/api/ready", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("ready 应 200，实际 %d", res.StatusCode)
	}
	if ok := decode[map[string]any](t, body)["ok"]; ok != true {
		t.Fatalf("ready 应返回 ok:true，实际 %v", ok)
	}

	// verify 正确密钥 → 200 ok:true。
	res, body = e.do(t, http.MethodPost, "/api/auth/verify", `{"key":"`+testKey+`"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("正确密钥应 200，实际 %d", res.StatusCode)
	}
	if ok := decode[map[string]any](t, body)["ok"]; ok != true {
		t.Fatalf("verify 应返回 ok:true，实际 %v", ok)
	}

	// verify 错误密钥 → 401。
	if res, _ := e.do(t, http.MethodPost, "/api/auth/verify", `{"key":"wrong"}`); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("错误密钥应 401，实际 %d", res.StatusCode)
	}

	// verify 非法 JSON → 400。
	if res, _ := e.do(t, http.MethodPost, "/api/auth/verify", `not-json`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("非法 JSON 应 400，实际 %d", res.StatusCode)
	}
}

// TestTaskMoveAcrossProjectsRejected 校验把任务移入另一项目的列被拒绝（数据完整性约束）。
func TestTaskMoveAcrossProjectsRejected(t *testing.T) {
	e := newTestEnv(t)
	p1 := createProject(t, e, "项目甲")
	p2 := createProject(t, e, "项目乙")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+p1, "")
	col1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodGet, "/api/projects/"+p2, "")
	col2 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	_, body = e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"跨项目任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)

	// 移入另一项目的列 → 400，且任务留在原列。
	if res, _ := e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"columnId":"`+col2+`","position":0}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("跨项目移动应 400，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+p1, "")
	if tasks := boardTasks(body); len(tasks) != 1 || tasks[0]["title"] != "跨项目任务" {
		t.Fatalf("任务应留在原列，实际 %v", tasks)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+p2, "")
	if tasks := boardTasks(body); len(tasks) != 0 {
		t.Fatalf("目标项目不应出现该任务，实际 %v", tasks)
	}
}

// TestTaskPositionClamping 校验任务越界 position 在服务层收敛（负数→列首，超大→列尾）。
func TestTaskPositionClamping(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "位置收敛")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务A"}`)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务B"}`)
	e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务C"}`)

	// 任务B（position 1）移到 position -1 → 收敛到列首。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	taskB := findTaskID(body, "任务B")
	if res, _ := e.do(t, http.MethodPatch, "/api/tasks/"+taskB, `{"position":-1}`); res.StatusCode != http.StatusOK {
		t.Fatalf("负数 position 应 200，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := taskTitles(body); !reflect.DeepEqual(got, []string{"任务B", "任务A", "任务C"}) {
		t.Fatalf("负数 position 应收敛到列首，实际 %v", got)
	}

	// 任务B（position 0）移到 position 99 → 收敛到列尾。
	taskB = findTaskID(body, "任务B")
	if res, _ := e.do(t, http.MethodPatch, "/api/tasks/"+taskB, `{"position":99}`); res.StatusCode != http.StatusOK {
		t.Fatalf("超大 position 应 200，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := taskTitles(body); !reflect.DeepEqual(got, []string{"任务A", "任务C", "任务B"}) {
		t.Fatalf("超大 position 应收敛到列尾，实际 %v", got)
	}
}

// TestColumnPositionClamping 校验列越界 position 收敛（负数→首位，超大→末尾）。
func TestColumnPositionClamping(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "列位置收敛")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	cols := decode[map[string]any](t, body)["columns"].([]any)
	doingID := cols[1].(map[string]any)["id"].(string) // 进行中

	// position -1 → 收敛到 0（列首）。
	if res, _ := e.do(t, http.MethodPatch, "/api/columns/"+doingID, `{"position":-1}`); res.StatusCode != http.StatusOK {
		t.Fatalf("负数 position 应 200，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := columnNames(body); !reflect.DeepEqual(got, []string{"进行中", "待办", "已阻塞", "已完成"}) {
		t.Fatalf("负数 position 应收敛到列首，实际 %v", got)
	}

	// position 99 → 收敛到列尾。
	if res, _ := e.do(t, http.MethodPatch, "/api/columns/"+doingID, `{"position":99}`); res.StatusCode != http.StatusOK {
		t.Fatalf("超大 position 应 200，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	if got := columnNames(body); !reflect.DeepEqual(got, []string{"待办", "已阻塞", "已完成", "进行中"}) {
		t.Fatalf("超大 position 应收敛到列尾，实际 %v", got)
	}
}

// TestRealtimeQueryErrors 校验 WS 握手前的参数校验（缺 project → 400，错密钥 → 401）。
func TestRealtimeQueryErrors(t *testing.T) {
	e := newTestEnv(t)

	// 缺 project 参数 → 400（未升级握手即拒绝）。
	if res, _ := e.doAuth(t, "", http.MethodGet, "/api/ws?key="+testKey, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("缺 project 参数应 400，实际 %d", res.StatusCode)
	}

	// 错误密钥 → 401。
	project := createProject(t, e, "查询鉴权")
	if res, _ := e.doAuth(t, "", http.MethodGet, "/api/ws?project="+project+"&key=wrong", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("错误密钥应 401，实际 %d", res.StatusCode)
	}
}

// TestRealtimeDisconnectNoPanic 校验客户端断开后广播不 panic、服务存活、可重连。
func TestRealtimeDisconnectNoPanic(t *testing.T) {
	e := newTestEnv(t)
	project := createProject(t, e, "断开项目")
	wsURL := "ws" + strings.TrimPrefix(e.srv.URL, "http") + "/api/ws?project=" + project + "&key=" + testKey

	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("WS 连接失败: %v", err)
	}
	time.Sleep(200 * time.Millisecond) // 等待订阅完成
	conn.CloseNow()                    // 客户端立即断开
	time.Sleep(200 * time.Millisecond) // 等待 handler 读循环退出并注销订阅

	// 断开后向该项目广播：不应 panic / 阻塞。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+project, "")
	column := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+column+"/tasks", `{"title":"断开后广播"}`)

	// 服务仍健康，且新连接能正常收到事件。
	if res, _ := e.do(t, http.MethodGet, "/api/health", ""); res.StatusCode != http.StatusOK {
		t.Fatalf("断开后服务应仍健康，实际 %d", res.StatusCode)
	}
	conn2, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("断开后重新连接失败: %v", err)
	}
	defer conn2.CloseNow()
	time.Sleep(200 * time.Millisecond)
	e.do(t, http.MethodPost, "/api/columns/"+column+"/tasks", `{"title":"重连后事件"}`)
	readCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, data, err := conn2.Read(readCtx)
	if err != nil {
		t.Fatalf("重连后读取事件失败: %v", err)
	}
	var ev realtime.Event
	if err := json.Unmarshal(data, &ev); err != nil {
		t.Fatalf("解析事件失败: %v", err)
	}
	if ev.Type != "task.created" {
		t.Fatalf("重连后应收到 task.created，实际 %+v", ev)
	}
}

// TestEventActionContract 锁定全部 25 个事件动作字符串（前端 lib/events.ts 与之对齐，ADR-0004）。
func TestEventActionContract(t *testing.T) {
	e := newTestEnv(t)
	project := createProject(t, e, "事件合约")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+project, "")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+project, "")
	col1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	wsURL := "ws" + strings.TrimPrefix(e.srv.URL, "http") + "/api/ws?project=" + project + "&key=" + testKey
	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("WS 连接失败: %v", err)
	}
	defer conn.CloseNow()
	time.Sleep(200 * time.Millisecond)

	// 每步执行一个写操作，读取一条 WS 事件并断言 action 字符串。
	readEvent := func(want string) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("读取 %s 事件失败: %v", want, err)
		}
		var ev realtime.Event
		if err := json.Unmarshal(data, &ev); err != nil {
			t.Fatalf("解析 %s 事件失败: %v, raw=%s", want, err, data)
		}
		if ev.Type != want {
			t.Fatalf("期望事件 %s，实际 %s（raw=%s）", want, ev.Type, data)
		}
	}

	// task 生命周期。
	_, body = e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"合约任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	readEvent("task.created")
	e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"title":"改名"}`)
	readEvent("task.updated")
	e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"position":0}`)
	readEvent("task.moved")
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/archive", "")
	readEvent("task.archived")
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/restore", "")
	readEvent("task.restored")

	// column 生命周期（用新建的空列做删除；按名称定位，不依赖索引）。
	e.do(t, http.MethodPost, "/api/projects/"+project+"/columns", `{"name":"临时列"}`)
	readEvent("column.created")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+project, "")
	tmpCol := findColumnID(body, "临时列")
	e.do(t, http.MethodPatch, "/api/columns/"+tmpCol, `{"name":"临时列2"}`)
	readEvent("column.updated")
	e.do(t, http.MethodPatch, "/api/columns/"+tmpCol, `{"position":0}`)
	readEvent("column.moved")
	e.do(t, http.MethodDelete, "/api/columns/"+tmpCol, "")
	readEvent("column.deleted")

	// comment 生命周期。
	_, body = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"合约评论"}`)
	commentID := decode[map[string]any](t, body)["id"].(string)
	readEvent("comment.created")
	e.do(t, http.MethodDelete, "/api/comments/"+commentID, "")
	readEvent("comment.deleted")

	// label 生命周期：created/updated/deleted 项目级（0006 Phase 2），attached/detached 项目级。
	_, body = e.do(t, http.MethodPost, "/api/projects/"+project+"/labels", `{"name":"合约标签"}`)
	labelID := decode[map[string]any](t, body)["id"].(string)
	readEvent("label.created")
	e.do(t, http.MethodPatch, "/api/labels/"+labelID, `{"name":"合约标签2"}`)
	readEvent("label.updated")
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, "")
	readEvent("label.attached")
	e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/labels/"+labelID, "")
	readEvent("label.detached")

	// milestone 生命周期：created/updated/attached/detached/deleted（项目级）。
	_, body = e.do(t, http.MethodPost, "/api/projects/"+project+"/milestones", `{"name":"合约里程碑"}`)
	milestoneID := decode[map[string]any](t, body)["id"].(string)
	readEvent("milestone.created")
	e.do(t, http.MethodPatch, "/api/milestones/"+milestoneID, `{"name":"合约里程碑2"}`)
	readEvent("milestone.updated")
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/"+milestoneID, "")
	readEvent("milestone.attached")
	e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/milestones/"+milestoneID, "")
	readEvent("milestone.detached")
	e.do(t, http.MethodDelete, "/api/milestones/"+milestoneID, "")
	readEvent("milestone.deleted")

	// member 生命周期（团队模式）：created/updated/deleted（工作区级广播）。
	_, body = e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members", `{"workspaceId":"`+workspaceID+`","name":"合约成员"}`)
	memberID := decode[map[string]any](t, body)["id"].(string)
	readEvent("member.created")
	e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"name":"合约成员2"}`)
	readEvent("member.updated")
	e.do(t, http.MethodDelete, "/api/members/"+memberID, "")
	readEvent("member.deleted")

	// task 删除、label 删除收尾。
	e.do(t, http.MethodDelete, "/api/tasks/"+taskID, "")
	readEvent("task.deleted")
	e.do(t, http.MethodDelete, "/api/labels/"+labelID, "")
	readEvent("label.deleted")
}

// boardTasks 返回看板第一列的任务（map 视图，按 position 顺序）。
func boardTasks(body []byte) []map[string]any {
	var board map[string]any
	_ = json.Unmarshal(body, &board)
	tasks := board["columns"].([]any)[0].(map[string]any)["tasks"].([]any)
	out := make([]map[string]any, 0, len(tasks))
	for _, t := range tasks {
		out = append(out, t.(map[string]any))
	}
	return out
}

// taskTitles 返回看板第一列任务标题（按 position 顺序）。
func taskTitles(body []byte) []string {
	tasks := boardTasks(body)
	out := make([]string, 0, len(tasks))
	for _, t := range tasks {
		out = append(out, t["title"].(string))
	}
	return out
}

// findColumnID 返回看板中指定名称列的 ID（列名断言用，不依赖数组索引）。
func findColumnID(body []byte, name string) string {
	var board map[string]any
	_ = json.Unmarshal(body, &board)
	for _, c := range board["columns"].([]any) {
		col := c.(map[string]any)
		if col["name"] == name {
			return col["id"].(string)
		}
	}
	return ""
}

// findTaskID 返回看板第一列中指定标题任务的 ID。
func findTaskID(body []byte, title string) string {
	for _, t := range boardTasks(body) {
		if t["title"] == title {
			return t["id"].(string)
		}
	}
	return ""
}

// columnNames 返回看板列名（按 position 顺序）。
func columnNames(body []byte) []string {
	var board map[string]any
	_ = json.Unmarshal(body, &board)
	cols := board["columns"].([]any)
	out := make([]string, 0, len(cols))
	for _, c := range cols {
		out = append(out, c.(map[string]any)["name"].(string))
	}
	return out
}

// TestMalformedBodyRejected 校验所有写端点对非法 JSON 统一返回 400（decodeBody 错误分支）。
func TestMalformedBodyRejected(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	projectID := createProject(t, e, "坏请求体")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col1 := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+col1+"/tasks", `{"title":"任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)

	for _, tc := range []struct {
		name   string
		method string
		path   string
	}{
		{"创建工作区", http.MethodPost, "/api/workspaces"},
		{"创建项目", http.MethodPost, "/api/workspaces/" + workspaceID + "/projects"},
		{"重命名项目", http.MethodPatch, "/api/projects/" + projectID},
		{"创建列", http.MethodPost, "/api/projects/" + projectID + "/columns"},
		{"更新列", http.MethodPatch, "/api/columns/" + col1},
		{"创建任务", http.MethodPost, "/api/columns/" + col1 + "/tasks"},
		{"更新任务", http.MethodPatch, "/api/tasks/" + taskID},
		{"创建标签", http.MethodPost, "/api/projects/" + projectID + "/labels"},
		{"发表评论", http.MethodPost, "/api/tasks/" + taskID + "/comments"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res, _ := e.do(t, tc.method, tc.path, `not-json`)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("非法 JSON 应 400，实际 %d", res.StatusCode)
			}
		})
	}
}

// TestDashboardContract 校验 /api/dashboard 聚合契约（形状 + 数据一致性）。
func TestDashboardContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "仪表盘项目")

	// 建任务：待办列 1 个 priority=urgent（0006 Phase 3 任务 3.4：focus/urgent 按 priority，非标签）。
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	cols := decode[map[string]any](t, body)["columns"].([]any)
	todoCol := cols[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+todoCol+"/tasks", `{"title":"待办任务","priority":"urgent"}`)

	res, body := e.do(t, http.MethodGet, "/api/dashboard", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("dashboard 应 200，实际 %d", res.StatusCode)
	}
	d := decode[map[string]any](t, body)

	// 统计卡：默认列待办/进行中/已阻塞/已完成，共 1 个任务（末列已完成空）。
	if d["totalTasks"].(float64) != 1 {
		t.Fatalf("totalTasks 应为 1，实际 %v", d["totalTasks"])
	}
	if d["urgent"].(float64) != 1 {
		t.Fatalf("urgent 应为 1，实际 %v", d["urgent"])
	}
	if d["completionPercent"].(float64) != 0 {
		t.Fatalf("completionPercent 应为 0（任务在首列非末列），实际 %v", d["completionPercent"])
	}

	// 数组字段非 null 且形状正确。
	for _, key := range []string{"byColumn", "byPriority", "projects", "focus", "recentActivity", "trend"} {
		if arr, _ := d[key].([]any); arr == nil {
			t.Fatalf("%s 应为数组而非 null", key)
		}
	}
	// 趋势：14 天窗口（含今天），每天有 created/completed 数值字段；今天应含刚创建的任务。
	trend := d["trend"].([]any)
	if len(trend) != 14 {
		t.Fatalf("trend 应为 14 天窗口，实际 %d", len(trend))
	}
	last := trend[len(trend)-1].(map[string]any)
	if _, ok := last["created"].(float64); !ok {
		t.Fatalf("trend 每天应含 created，实际 %v", last)
	}
	if _, ok := last["completed"].(float64); !ok {
		t.Fatalf("trend 每天应含 completed，实际 %v", last)
	}
	// 项目速览应带 workspaceId（前端跨工作区跳转用）。
	projects := d["projects"].([]any)
	if len(projects) != 1 {
		t.Fatalf("projects 应含 1 个项目，实际 %d", len(projects))
	}
	if ws, ok := projects[0].(map[string]any)["workspaceId"].(string); !ok || ws == "" {
		t.Fatalf("projects[0].workspaceId 应存在，实际 %v", projects[0])
	}
	if focus := d["focus"].([]any); len(focus) != 1 || focus[0].(map[string]any)["title"] != "待办任务" {
		t.Fatalf("focus 应含待办任务，实际 %v", focus)
	} else {
		focusItem := focus[0].(map[string]any)
		if focusItem["projectName"] != "仪表盘项目" {
			t.Fatalf("focus.projectName 应返回来源项目，实际 %v", focusItem)
		}
	}
	// 最近活动含 task.created（结构化字段 projectName/action/createdAt；文案由前端渲染）。
	recent := d["recentActivity"].([]any)
	foundCreated := false
	for _, item := range recent {
		m := item.(map[string]any)
		if m["action"] == "task.created" && m["projectName"] != "" {
			foundCreated = true
			break
		}
	}
	if !foundCreated {
		t.Fatalf("recentActivity 应含 task.created 结构化条目，实际 %v", recent)
	}
}

// TestBackupContract 校验 /api/settings/backup 导出完整性（只导出）。
func TestBackupContract(t *testing.T) {
	e := newTestEnv(t)
	createProject(t, e, "备份项目")

	res, body := e.do(t, http.MethodGet, "/api/settings/backup", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("backup 应 200，实际 %d", res.StatusCode)
	}
	b := decode[map[string]any](t, body)

	if _, ok := b["exportedAt"]; !ok {
		t.Fatalf("backup 应含 exportedAt")
	}
	for _, key := range []string{"workspaces", "projects", "columns", "tasks", "labels", "taskLabels", "comments", "activities"} {
		if arr, _ := b[key].([]any); arr == nil {
			t.Fatalf("backup.%s 应为数组而非 null", key)
		}
	}
	projects := b["projects"].([]any)
	if len(projects) != 1 {
		t.Fatalf("backup.projects 应含 1 个项目，实际 %d", len(projects))
	}
	if p := projects[0].(map[string]any); p["name"] != "备份项目" {
	}
	if columns := b["columns"].([]any); len(columns) != 4 {
		t.Fatalf("backup.columns 应含 4 个默认列，实际 %d", len(columns))
	}
}

// TestBackupImportContract 校验 /api/settings/backup 导入（全量替换恢复）：
// 导出 → 删除项目 → 导入 → 项目还原；非法快照（缺 workspaces）拒绝。
func TestBackupImportContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "备份项目")
	_, body := e.do(t, http.MethodGet, "/api/settings/backup", "")

	// 制造「当前与快照不同」的状态：删掉项目。
	if res, _ := e.do(t, http.MethodDelete, "/api/projects/"+projectID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除项目应 204，实际 %d", res.StatusCode)
	}

	res, resBody := e.do(t, http.MethodPost, "/api/settings/backup", string(body))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("导入应 200，实际 %d（%s）", res.StatusCode, resBody)
	}

	// 导入后项目应还原。
	_, body = e.do(t, http.MethodGet, "/api/workspaces", "")
	wsID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+wsID+"/projects", "")
	projects := decode[[]map[string]any](t, body)
	if len(projects) != 1 || projects[0]["name"] != "备份项目" {
		t.Fatalf("导入后应还原 1 个项目，实际 %+v", projects)
	}

	// 非法快照（缺 workspaces）应 400，且不破坏现有数据。
	if res, _ := e.do(t, http.MethodPost, "/api/settings/backup", `{"foo":1}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("非法快照应 400，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+wsID+"/projects", "")
	if projects := decode[[]map[string]any](t, body); len(projects) != 1 {
		t.Fatalf("非法快照不应破坏数据，实际 %d 个项目", len(projects))
	}
}

// TestProjectUpdatedAt 校验项目创建/重命名写入 updatedAt，列表接口返回该字段。
func TestProjectUpdatedAt(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"时间项目"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建项目应 201，实际 %d", res.StatusCode)
	}
	created := decode[map[string]any](t, body)
	createdID := created["id"].(string)
	if _, ok := created["updatedAt"]; !ok {
		t.Fatalf("创建响应应含 updatedAt，实际键: %v", jsonKeys(created))
	}

	// 重命名后 updatedAt 应更新且非空。
	if res, body := e.do(t, http.MethodPatch, "/api/projects/"+createdID, `{"name":"时间项目2"}`); res.StatusCode != http.StatusOK {
		t.Fatalf("重命名应 200，实际 %d", res.StatusCode)
	} else {
		if u := decode[map[string]any](t, body)["updatedAt"]; u == nil || u == "" {
			t.Fatalf("重命名后 updatedAt 应为非空，实际 %v", u)
		}
	}

	// 列表接口返回 updatedAt（前端卡片 meta 依赖）。
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/projects", "")
	p := decode[[]map[string]any](t, body)
	if len(p) != 1 {
		t.Fatalf("应恰有 1 个项目，实际 %d", len(p))
	}
	if _, ok := p[0]["updatedAt"]; !ok {
		t.Fatalf("列表项目应含 updatedAt，实际键: %v", jsonKeys(p[0]))
	}
}

// TestActivityContract 校验 /api/activity 全局活动流（形状 + 含任务活动）。
func TestActivityContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "活动项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+col+"/tasks", `{"title":"活动任务"}`)

	res, body := e.do(t, http.MethodGet, "/api/activity", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("activity 应 200，实际 %d", res.StatusCode)
	}
	items := decode[[]map[string]any](t, body)
	if len(items) < 1 {
		t.Fatalf("activity 应含任务活动，实际 %d 条", len(items))
	}
	// 最新一条应为 task.created，且带项目名。
	latest := items[0]
	if latest["action"] != "task.created" {
		t.Fatalf("最新活动应为 task.created，实际 %v", latest["action"])
	}
	if latest["projectName"] != "活动项目" {
		t.Fatalf("活动应带项目名，实际 %v", latest["projectName"])
	}
	for _, key := range []string{"id", "projectName", "action", "createdAt"} {
		if _, ok := latest[key]; !ok {
			t.Fatalf("活动条目缺 %q，实际键: %v", key, jsonKeys(latest))
		}
	}
}

// TestMemberLifecycle 校验成员体系（0006 Phase 1）：me、创建、密钥授权幂等、
// 成员密钥登录、owner 保护、删除后密钥失效。
func TestMemberLifecycle(t *testing.T) {
	e := newTestEnv(t)

	// me：owner 身份 + workspaceId（壳层/个人中心数据源）。
	res, body := e.do(t, http.MethodGet, "/api/me", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me 应 200，实际 %d", res.StatusCode)
	}
	me := decode[map[string]any](t, body)
	member := me["member"].(map[string]any)
	workspaceID := me["workspaceId"].(string)
	if member["name"] != "Ad" || member["role"] != "owner" {
		t.Fatalf("owner 应为 Ad/owner，实际 %v", member)
	}
	if workspaceID == "" {
		t.Fatalf("me 应返回 workspaceId")
	}
	// me 响应不得泄露 accessKey。
	if _, ok := member["accessKey"]; ok {
		t.Fatalf("me 不应返回 accessKey，实际键: %v", jsonKeys(member))
	}

	// 创建成员（默认角色 member）。
	res, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"Kim"}`, workspaceID))
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建成员应 201，实际 %d", res.StatusCode)
	}
	created := decode[map[string]any](t, body)
	if created["role"] != "member" {
		t.Fatalf("新成员角色应为 member，实际 %v", created["role"])
	}
	createdID := created["id"].(string)

	// 列表含 2 人（owner + Kim）。
	res, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/members", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("成员列表应 200，实际 %d", res.StatusCode)
	}
	if members := decode[[]map[string]any](t, body); len(members) != 2 {
		t.Fatalf("成员应 2 人，实际 %d", len(members))
	}
	// 生成密钥 → 幂等：再次生成返回同一密钥。
	res, body = e.do(t, http.MethodPost, "/api/members/"+createdID+"/key", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("生成密钥应 200，实际 %d", res.StatusCode)
	}
	key1 := decode[map[string]any](t, body)["key"].(string)
	if !strings.HasPrefix(key1, "kanso-") {
		t.Fatalf("密钥应带 kanso- 前缀，实际 %q", key1)
	}
	_, body = e.do(t, http.MethodPost, "/api/members/"+createdID+"/key", "")
	if key2 := decode[map[string]any](t, body)["key"].(string); key2 != key1 {
		t.Fatalf("重复生成应幂等返回同一密钥，实际 %q vs %q", key2, key1)
	}

	// 用成员密钥访问 /api/me → 命中该成员（非 owner）。
	res, body = e.doAuth(t, key1, http.MethodGet, "/api/me", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("成员密钥应可访问 me，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["member"].(map[string]any)["name"]; got != "Kim" {
		t.Fatalf("成员密钥应命中 Kim，实际 %v", got)
	}

	// owner 保护：删除 owner 应 400。
	ownerID := member["id"].(string)
	if res, _ := e.do(t, http.MethodDelete, "/api/members/"+ownerID, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("删除 owner 应 400，实际 %d", res.StatusCode)
	}

	// 删除成员 → 204，且其密钥立即失效（401）。
	if res, _ := e.do(t, http.MethodDelete, "/api/members/"+createdID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除成员应 204，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, key1, http.MethodGet, "/api/me", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("删除后密钥应失效 401，实际 %d", res.StatusCode)
	}
}

// TestMemberReservedAdminName 回归 W-1：成员创建/自改名禁止使用保留名 "Admin"
// （否则 ReownLegacyAdmin 会在下次 team 启动时把其历史归属静默重写为 owner 名）。
func TestMemberReservedAdminName(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 创建名为 Admin 的成员 → 400，错误信息说明保留名。
	res, body := e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"Admin"}`, workspaceID))
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("创建 Admin 名成员应 400，实际 %d", res.StatusCode)
	}
	if !strings.Contains(decode[map[string]any](t, body)["error"].(string), "Admin") {
		t.Fatalf("错误信息应说明 Admin 保留名，实际 %s", body)
	}

	// 正常创建成员后改名为 Admin → 400，且原名保持不变。
	res, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"Kim"}`, workspaceID))
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建成员应 201，实际 %d", res.StatusCode)
	}
	memberID := decode[map[string]any](t, body)["id"].(string)
	if res, _ := e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"name":"Admin"}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("改名为 Admin 应 400，实际 %d", res.StatusCode)
	}
	res, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/members", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("成员列表应 200，实际 %d", res.StatusCode)
	}
	found := false
	for _, m := range decode[[]map[string]any](t, body) {
		if m["id"] == memberID {
			found = true
			if m["name"] != "Kim" {
				t.Fatalf("改名被拒后名称应保持 Kim，实际 %v", m["name"])
			}
		}
	}
	if !found {
		t.Fatalf("被拒改名的成员应仍存在")
	}
}

// TestMemberLimit 校验 5 人上限（与前端 profile 页 / Mock 同步）。
func TestMemberLimit(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 已 1 人（owner），再建 4 人到达上限。
	for i := 1; i <= 4; i++ {
		res, _ := e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"成员%d"}`, workspaceID, i))
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("第 %d 个成员应 201，实际 %d", i, res.StatusCode)
		}
	}
	// 第 5 个普通成员被拒。
	res, body := e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"超员"}`, workspaceID))
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("超员创建应 400，实际 %d", res.StatusCode)
	}
	if !strings.Contains(decode[map[string]any](t, body)["error"].(string), "上限") {
		t.Fatalf("超员错误应含「上限」，实际 %s", body)
	}
}

// TestVerifyMultiKey 校验 verify 命中任一成员密钥（owner 与授权成员均可登录）。
func TestVerifyMultiKey(t *testing.T) {
	e := newTestEnv(t)

	// owner 密钥（testKey）→ ok:true。
	if res, body := e.do(t, http.MethodPost, "/api/auth/verify", `{"key":"`+testKey+`"}`); res.StatusCode != http.StatusOK || decode[map[string]any](t, body)["ok"] != true {
		t.Fatalf("owner 密钥 verify 应 ok:true")
	}

	// 新成员密钥 → ok:true。
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"成员A"}`, workspaceID))
	memberID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members/"+memberID+"/key", "")
	memberKey := decode[map[string]any](t, body)["key"].(string)
	if res, body := e.do(t, http.MethodPost, "/api/auth/verify", fmt.Sprintf(`{"key":%q}`, memberKey)); res.StatusCode != http.StatusOK || decode[map[string]any](t, body)["ok"] != true {
		t.Fatalf("成员密钥 verify 应 ok:true")
	}

	// 未授权密钥 → 401。
	if res, _ := e.do(t, http.MethodPost, "/api/auth/verify", `{"key":"nope"}`); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("未授权密钥应 401，实际 %d", res.StatusCode)
	}
}

func TestCrossProjectLabelRejected(t *testing.T) {
	e := newTestEnv(t)
	projectA := createProject(t, e, "标签任务项目")
	projectB := createProject(t, e, "标签来源项目")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectA, "")
	taskColumn := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+taskColumn+"/tasks", `{"title":"不应跨项目贴标签"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)

	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectB+"/labels", `{"name":"另一项目标签"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建标签应 201，实际 %d: %s", res.StatusCode, body)
	}
	labelID := decode[map[string]any](t, body)["id"].(string)

	res, _ = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/labels/"+labelID, "")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("跨项目贴标签应 400，实际 %d", res.StatusCode)
	}
}

func TestSearchIncludesComment(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "评论搜索项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"普通标题"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"独特评论检索词"}`)

	res, body := e.do(t, http.MethodGet, "/api/search?q=独特评论检索词", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("搜索应 200，实际 %d: %s", res.StatusCode, body)
	}
	results := decode[[]map[string]any](t, body)
	if len(results) != 1 || results[0]["id"] != taskID {
		t.Fatalf("搜索应命中评论所属任务，实际 %v", results)
	}
}

func TestMemberAdministrationRequiresOwner(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"普通成员"}`, workspaceID))
	memberID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members/"+memberID+"/key", "")
	memberKey := decode[map[string]any](t, body)["key"].(string)

	if res, _ := e.doAuth(t, memberKey, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"越权成员"}`, workspaceID)); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员创建成员应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodPost, "/api/members/"+memberID+"/key", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员授权密钥应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodDelete, "/api/members/"+memberID, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员删除成员应 403，实际 %d", res.StatusCode)
	}
	// 敏感设置与全量备份同样只允许 owner：否则普通成员可读取/修改访问密钥，
	// 或通过导入备份破坏整个实例数据。
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/settings/config", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员读取配置应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodPut, "/api/settings/config", `{"addr":":9999","dataDir":"./data"}`); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员修改配置应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodGet, "/api/settings/backup", ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员导出备份应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodPost, "/api/settings/backup", `{"workspaces":[{"id":"w1","name":"x"}]}`); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员导入备份应 403，实际 %d", res.StatusCode)
	}
}

// TestDestructiveDeleteRequiresOwner 校验团队模式下工作区/项目/列的 DELETE 均需 owner
// （普通成员 403；owner 正常删除）。个人模式无成员表，恒放行（ADR-0013）。
func TestDestructiveDeleteRequiresOwner(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"待删项目"}`)
	projectID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	_, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"普通成员"}`, workspaceID))
	memberID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members/"+memberID+"/key", "")
	memberKey := decode[map[string]any](t, body)["key"].(string)

	if res, _ := e.doAuth(t, memberKey, http.MethodDelete, "/api/workspaces/"+workspaceID, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员删除工作区应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodDelete, "/api/projects/"+projectID, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员删除项目应 403，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, memberKey, http.MethodDelete, "/api/columns/"+columnID, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("普通成员删除列应 403，实际 %d", res.StatusCode)
	}
	// owner 可正常删除（删除列 204）。
	if res, _ := e.do(t, http.MethodDelete, "/api/columns/"+columnID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("owner 删除列应 204，实际 %d", res.StatusCode)
	}
}

// TestColumnWipClear 校验 WIP 限制：建列即设、PATCH null 清空、数值重设（0006 Phase 3 任务 3.6）。
func TestColumnWipClear(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "WIP 列")

	res, body := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/columns", `{"name":"限流列","wipLimit":3}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("建列应 201，实际 %d", res.StatusCode)
	}
	columnID := decode[map[string]any](t, body)["id"].(string)
	if got := decode[map[string]any](t, body)["wipLimit"].(float64); got != 3 {
		t.Fatalf("建列应带 wipLimit=3，实际 %v", got)
	}

	// PATCH null → 清空。
	res, body = e.do(t, http.MethodPatch, "/api/columns/"+columnID, `{"wipLimit":null}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("清空 WIP 应 200，实际 %d", res.StatusCode)
	}
	if v, ok := decode[map[string]any](t, body)["wipLimit"]; !ok || v != nil {
		t.Fatalf("wipLimit 应清空为 null，实际 %v", v)
	}

	// PATCH 数值 → 重设。
	res, body = e.do(t, http.MethodPatch, "/api/columns/"+columnID, `{"wipLimit":5}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("重设 WIP 应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["wipLimit"].(float64); got != 5 {
		t.Fatalf("wipLimit 应为 5，实际 %v", got)
	}

	// 负值拒绝。
	if res, _ := e.do(t, http.MethodPatch, "/api/columns/"+columnID, `{"wipLimit":-1}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("负 WIP 应 400，实际 %d", res.StatusCode)
	}
}

// TestCommentDeletedActivity 校验删除评论记录 comment.deleted 活动（0006 Phase 3 任务 3.7）。
func TestCommentDeletedActivity(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "评论活动")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+col+"/tasks", `{"title":"评论任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"将被删除"}`)
	commentID := decode[map[string]any](t, body)["id"].(string)
	if res, _ := e.do(t, http.MethodDelete, "/api/comments/"+commentID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删评论应 204，实际 %d", res.StatusCode)
	}

	// 详情活动流应含 comment.deleted，data 带被删内容。
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	activity := decode[map[string]any](t, body)["activity"].([]any)
	found := false
	for _, a := range activity {
		m := a.(map[string]any)
		if m["action"] == "comment.deleted" {
			found = true
			if !strings.Contains(m["data"].(string), "将被删除") {
				t.Fatalf("comment.deleted data 应带被删内容，实际 %v", m["data"])
			}
		}
	}
	if !found {
		t.Fatalf("活动流应含 comment.deleted，实际 %v", activity)
	}
}

// TestMilestoneProgress 校验里程碑进度聚合（0006 Phase 3 任务 3.8 / 0005 §5.4）。
func TestMilestoneProgress(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "进度项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	cols := decode[map[string]any](t, body)["columns"].([]any)
	firstCol := cols[0].(map[string]any)["id"].(string)
	lastCol := cols[len(cols)-1].(map[string]any)["id"].(string)

	// 末列任务（已完成）+ 首列任务（未完成）。
	_, body = e.do(t, http.MethodPost, "/api/columns/"+lastCol+"/tasks", `{"title":"完成的任务"}`)
	doneTask := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+firstCol+"/tasks", `{"title":"未完成任务"}`)
	openTask := decode[map[string]any](t, body)["id"].(string)

	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/milestones", `{"name":"M1"}`)
	milestoneID := decode[map[string]any](t, body)["id"].(string)
	if res, _ := e.do(t, http.MethodPost, "/api/tasks/"+doneTask+"/milestones/"+milestoneID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("关联完成任务应 204，实际 %d", res.StatusCode)
	}
	e.do(t, http.MethodPost, "/api/tasks/"+openTask+"/milestones/"+milestoneID, "")

	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID+"/milestones", "")
	items := decode[[]map[string]any](t, body)
	if len(items) != 1 {
		t.Fatalf("应 1 个里程碑，实际 %d", len(items))
	}
	progress := items[0]["progress"].(map[string]any)
	if progress["total"].(float64) != 2 || progress["done"].(float64) != 1 {
		t.Fatalf("进度应为 total=2 done=1，实际 %v", progress)
	}
}

// TestBackupTaskMilestones 校验备份快照含 taskMilestones（0006 Phase 3 任务 3.9 / 0005 §5.7）。
func TestBackupTaskMilestones(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "备份项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	col := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+col+"/tasks", `{"title":"备份任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/milestones", `{"name":"备份里程碑"}`)
	milestoneID := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/milestones/"+milestoneID, "")

	res, body := e.do(t, http.MethodGet, "/api/settings/backup", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("备份应 200，实际 %d", res.StatusCode)
	}
	snapshot := decode[map[string]any](t, body)
	pairs, ok := snapshot["taskMilestones"].([]any)
	if !ok || len(pairs) != 1 {
		t.Fatalf("备份应含 1 条 taskMilestones，实际 %v", snapshot["taskMilestones"])
	}
	pair := pairs[0].(map[string]any)
	if pair["taskId"] != taskID || pair["milestoneId"] != milestoneID {
		t.Fatalf("taskMilestones 对错误: %v", pair)
	}
}

// TestDashboardFocusExcludesDone 校验 focus 排除末列（已完成）任务（0006 Phase 3 任务 3.4）。
func TestDashboardFocusExcludesDone(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "关注项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	cols := decode[map[string]any](t, body)["columns"].([]any)
	firstCol := cols[0].(map[string]any)["id"].(string)
	lastCol := cols[len(cols)-1].(map[string]any)["id"].(string)

	// 末列 urgent 任务（已完成）不进 focus；首列 dueDate 任务进 focus。
	e.do(t, http.MethodPost, "/api/columns/"+lastCol+"/tasks", `{"title":"已完成紧急","priority":"urgent"}`)
	e.do(t, http.MethodPost, "/api/columns/"+firstCol+"/tasks", `{"title":"临期任务","dueDate":"2026-12-31"}`)

	_, body = e.do(t, http.MethodGet, "/api/dashboard", "")
	d := decode[map[string]any](t, body)
	focus := d["focus"].([]any)
	if len(focus) != 1 || focus[0].(map[string]any)["title"] != "临期任务" {
		t.Fatalf("focus 应仅含首列临期任务（末列排除），实际 %v", focus)
	}
	if urgent := d["urgent"].(float64); urgent != 1 {
		t.Fatalf("urgent 计数应为 1（按 priority，含末列），实际 %v", urgent)
	}
}

// 列名提取见文件中部 columnNames(body)（既有辅助）。

// ---- 契约与回归测试（2026-08-16 补）----

// newTestEnvMode 以指定模式构建测试环境；newTestEnv 保持团队模式默认不变。
// 两种模式均应用全部迁移并种子 owner 成员（personal = 单一 owner，ADR-0013 修订）。
func newTestEnvMode(t *testing.T, mode config.Mode) *testEnv {
	return newTestEnvModeOrigins(t, mode, nil)
}

func newTestEnvModeOrigins(t *testing.T, mode config.Mode, wsOrigins []string) *testEnv {
	t.Helper()
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	svc := service.New(database, mode)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatalf("种子默认工作区失败: %v", err)
	}
	// 种子 owner 成员并把测试密钥写入其 access_key（与 main.go 启动流程一致）。
	if err := svc.SeedOwnerMember(context.Background(), testKey); err != nil {
		t.Fatalf("种子 owner 成员失败: %v", err)
	}
	cfg := config.Config{
		Addr:                 "127.0.0.1:0",
		AccessKey:            testKey,
		Mode:                 mode,
		WSOrigins:            wsOrigins,
		AutoArchiveEnabled:   config.DefaultAutoArchiveEnabled,
		AutoArchiveAfterDays: config.DefaultAutoArchiveAfterDays,
	}
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc, realtime.NewHub()))
	t.Cleanup(srv.Close)
	return &testEnv{srv: srv, db: database}
}

// TestPersonalModeContract 覆盖默认部署（personal 模式，KANSO_MODE 缺省）：
// me 返回 owner 成员身份（初始名 Admin）+ 所属工作区、共享密钥鉴权、
// 成员管理端点未注册（404）、PATCH /api/members/{id} 自我改名可用、
// 评论/活动 actor 归属 "Admin"、member 表存在（personal = 单一 owner，ADR-0013 修订）。
func TestPersonalModeContract(t *testing.T) {
	e := newTestEnvMode(t, config.ModePersonal)

	// me：owner 成员身份（初始名 Admin）+ workspaceId 非空 + mode personal（web/src/types/me.ts 契约）。
	res, body := e.do(t, http.MethodGet, "/api/me", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me 应 200，实际 %d", res.StatusCode)
	}
	me := decode[map[string]any](t, body)
	member := me["member"].(map[string]any)
	if member["name"] != "Admin" || member["role"] != "owner" {
		t.Fatalf("personal 模式应返回初始名 Admin 的 owner 成员，实际 %v", member)
	}
	if member["id"] == "" || member["id"] == "admin" {
		t.Fatalf("personal 模式 owner 应是真实成员行（非固定 admin 常量），实际 %v", member["id"])
	}
	if ws, ok := me["workspaceId"].(string); !ok || ws == "" {
		t.Fatalf("personal 模式 me 应返回所属工作区，实际 %v", me["workspaceId"])
	}
	if me["mode"] != "personal" {
		t.Fatalf("mode 应为 personal，实际 %v", me["mode"])
	}
	if _, ok := member["accessKey"]; ok {
		t.Fatalf("me 不应返回 accessKey，实际键: %v", jsonKeys(member))
	}

	// 共享密钥鉴权：正确密钥 200，空/错误密钥 401。
	if res, _ := e.doAuth(t, "", http.MethodGet, "/api/workspaces", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("空密钥应 401，实际 %d", res.StatusCode)
	}
	if res, _ := e.doAuth(t, "wrong-key", http.MethodGet, "/api/workspaces", ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("错误密钥应 401，实际 %d", res.StatusCode)
	}

	// 成员管理端点未注册：personal 模式 404（路由未挂载，成员禁用）。
	_, body = e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	for _, tc := range []struct {
		name   string
		method string
		path   string
	}{
		{"成员列表", http.MethodGet, "/api/workspaces/" + workspaceID + "/members"},
		{"创建成员", http.MethodPost, "/api/members"},
		{"生成密钥", http.MethodPost, "/api/members/x/key"},
	} {
		if res, _ := e.do(t, tc.method, tc.path, ""); res.StatusCode != http.StatusNotFound {
			t.Fatalf("personal 模式 %s 应 404（路由未注册），实际 %d", tc.name, res.StatusCode)
		}
	}
	// PATCH 使 /api/members/{id} 路径已注册：DELETE 未注册 → 405（成员删除禁用）。
	if res, _ := e.do(t, http.MethodDelete, "/api/members/x", ""); res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("personal 模式删除成员应 405（方法未注册），实际 %d", res.StatusCode)
	}

	// 自我改名：PATCH /api/members/{id}（personal = 单独管理员，与 team 一致）。
	memberID := member["id"].(string)
	if res, body := e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"name":"个人改名"}`); res.StatusCode != http.StatusOK {
		t.Fatalf("personal 模式自我改名应 200，实际 %d: %s", res.StatusCode, body)
	}
	_, body = e.do(t, http.MethodGet, "/api/me", "")
	if got := decode[map[string]any](t, body)["member"].(map[string]any)["name"]; got != "个人改名" {
		t.Fatalf("改名后 me 应返回新名，实际 %v", got)
	}

	// 评论作者 / 活动 actor 归属当前显示名（改名后为 个人改名）。
	projectID := createProject(t, e, "个人模式项目")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"个人任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/comments", `{"content":"改名后评论"}`)
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	detail := decode[map[string]any](t, body)
	if got := detail["comments"].([]any)[0].(map[string]any)["author"]; got != "个人改名" {
		t.Fatalf("personal 模式评论作者应为当前显示名，实际 %v", got)
	}
	for _, item := range detail["activity"].([]any) {
		if got := item.(map[string]any)["actor"]; got != "个人改名" {
			t.Fatalf("personal 模式活动 actor 应为当前显示名，实际 %v", item)
		}
	}

	// member 表存在（两种模式均建表），且仅一个 owner 成员。
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='member'`).Scan(&n); err != nil {
		t.Fatalf("查询 member 表失败: %v", err)
	}
	if n != 1 {
		t.Fatalf("personal 模式应建 member 表")
	}
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM member`).Scan(&n); err != nil {
		t.Fatalf("查询成员数失败: %v", err)
	}
	if n != 1 {
		t.Fatalf("personal 模式应只有 1 个 owner 成员，实际 %d", n)
	}
}

// TestSearchContract 锁定 /api/search 契约（ADR-0009 / web/src/types/search.ts）：
// 标题/描述命中、空 q 返回最近列表、归档任务仍可搜索、SearchHit 形状携带
// projectId/workspaceId/priority/dueDate。
func TestSearchContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "搜索项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	res, body := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"独特标题词","description":"独特描述词","priority":"high","dueDate":"2026-12-01"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建任务应 201，实际 %d", res.StatusCode)
	}
	taskID := decode[map[string]any](t, body)["id"].(string)

	// 标题命中 + SearchHit 形状。
	res, body = e.do(t, http.MethodGet, "/api/search?q=独特标题词", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("搜索应 200，实际 %d", res.StatusCode)
	}
	results := decode[[]map[string]any](t, body)
	if len(results) != 1 || results[0]["id"] != taskID {
		t.Fatalf("标题搜索应命中任务，实际 %v", results)
	}
	hit := results[0]
	for _, key := range []string{"id", "title", "columnId", "priority", "dueDate", "projectId", "projectName", "workspaceId", "workspaceName"} {
		if _, ok := hit[key]; !ok {
			t.Fatalf("SearchHit 缺 %q，实际键: %v", key, jsonKeys(hit))
		}
	}
	if hit["projectId"] != projectID || hit["workspaceId"] == "" {
		t.Fatalf("SearchHit 应携带 projectId/workspaceId，实际 %v", hit)
	}
	if hit["priority"] != "high" || hit["dueDate"] != "2026-12-01" {
		t.Fatalf("SearchHit 应携带 priority/dueDate，实际 %v", hit)
	}

	// 描述命中。
	res, body = e.do(t, http.MethodGet, "/api/search?q=独特描述词", "")
	if res.StatusCode != http.StatusOK || len(decode[[]map[string]any](t, body)) != 1 {
		t.Fatalf("描述搜索应命中任务，实际 %d: %s", res.StatusCode, body)
	}

	// 归档任务仍可搜索（归档不参与看板，但保留在全局搜索）。
	e.do(t, http.MethodPost, "/api/tasks/"+taskID+"/archive", "")
	res, body = e.do(t, http.MethodGet, "/api/search?q=独特标题词", "")
	if res.StatusCode != http.StatusOK || len(decode[[]map[string]any](t, body)) != 1 {
		t.Fatalf("归档任务应仍可搜索，实际 %d: %s", res.StatusCode, body)
	}

	// 空 q：返回最近更新列表（命令面板未输入时的快捷入口），且含刚创建任务。
	res, body = e.do(t, http.MethodGet, "/api/search?q=", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("空 q 搜索应 200，实际 %d", res.StatusCode)
	}
	recent := decode[[]map[string]any](t, body)
	if len(recent) == 0 {
		t.Fatalf("空 q 应返回最近任务列表，实际为空")
	}
	found := false
	for _, r := range recent {
		if r["id"] == taskID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("空 q 列表应含刚创建任务，实际 %v", recent)
	}
}

// TestTaskPriorityDueDateContract 锁定 priority/dueDate 的 PATCH 语义：
// 创建默认 'med'；PATCH 省略字段保留现值；显式空串清空；看板与详情 JSON 均携带两字段。
func TestTaskPriorityDueDateContract(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "优先级项目")
	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)

	// 创建：未指定 priority 默认 'med'。
	res, body := e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"默认优先级"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建任务应 201，实际 %d", res.StatusCode)
	}
	taskID := decode[map[string]any](t, body)["id"].(string)

	// 创建后即取详情，断言默认优先级为 'med'。
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	created := decode[map[string]any](t, body)["task"].(map[string]any)
	if created["priority"] != "med" {
		t.Fatalf("创建任务默认 priority 应 'med'，实际 %v", created["priority"])
	}

	// 显式设置 priority/dueDate。
	res, body = e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"priority":"urgent","dueDate":"2026-12-31"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("PATCH 应 200，实际 %d", res.StatusCode)
	}
	updated := decode[map[string]any](t, body)
	if updated["priority"] != "urgent" || updated["dueDate"] != "2026-12-31" {
		t.Fatalf("PATCH 后字段错误: %v", updated)
	}

	// 省略字段 → 保留现值。
	res, body = e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"title":"仅改名"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("省略字段 PATCH 应 200，实际 %d", res.StatusCode)
	}
	updated = decode[map[string]any](t, body)
	if updated["priority"] != "urgent" || updated["dueDate"] != "2026-12-31" {
		t.Fatalf("省略字段应保留现值，实际 %v", updated)
	}

	// 显式空串 dueDate → 清空为 null。
	res, body = e.do(t, http.MethodPatch, "/api/tasks/"+taskID, `{"dueDate":""}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("清空 dueDate 应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["dueDate"]; got != nil {
		t.Fatalf("空串 dueDate 应清空为 null，实际 %v", got)
	}

	// 看板 JSON 与详情 JSON 均携带 priority/dueDate。
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	boardTask := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["tasks"].([]any)[0].(map[string]any)
	for _, key := range []string{"priority", "dueDate"} {
		if _, ok := boardTask[key]; !ok {
			t.Fatalf("看板任务缺 %q，实际键: %v", key, jsonKeys(boardTask))
		}
	}
	_, body = e.do(t, http.MethodGet, "/api/tasks/"+taskID, "")
	detailTask := decode[map[string]any](t, body)["task"].(map[string]any)
	for _, key := range []string{"priority", "dueDate"} {
		if _, ok := detailTask[key]; !ok {
			t.Fatalf("详情任务缺 %q，实际键: %v", key, jsonKeys(detailTask))
		}
	}
}

// TestMemberAvatarClearContract 回归修复 2：PATCH avatar 三态语义与 Mock 一致
// （web/src/mocks/handlers.ts）——省略保留、null 清空、字符串设置。
func TestMemberAvatarClearContract(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/members", fmt.Sprintf(`{"workspaceId":%q,"name":"头像成员"}`, workspaceID))
	memberID := decode[map[string]any](t, body)["id"].(string)

	// 字符串设置。
	res, body := e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"avatar":"data:image/png;base64,AA=="}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("设置头像应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["avatar"]; got != "data:image/png;base64,AA==" {
		t.Fatalf("头像应已设置，实际 %v", got)
	}

	// 省略 avatar → 保留现值。
	res, body = e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"name":"头像成员2"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("省略 avatar 应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["avatar"]; got != "data:image/png;base64,AA==" {
		t.Fatalf("省略 avatar 应保留现值，实际 %v", got)
	}

	// null → 清空。
	res, body = e.do(t, http.MethodPatch, "/api/members/"+memberID, `{"avatar":null}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("清空头像应 200，实际 %d", res.StatusCode)
	}
	if got := decode[map[string]any](t, body)["avatar"]; got != nil {
		t.Fatalf("avatar null 应清空，实际 %v", got)
	}
}

// TestCrossProjectMilestoneDetachRejected 回归修复 3：跨项目解除里程碑应 400
// （与 attach 同一 ErrCrossProjectMove 映射；此前 detach 落入 500）。
func TestCrossProjectMilestoneDetachRejected(t *testing.T) {
	e := newTestEnv(t)
	projectA := createProject(t, e, "任务项目")
	projectB := createProject(t, e, "里程碑项目")

	_, body := e.do(t, http.MethodGet, "/api/projects/"+projectA, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"跨项目任务"}`)
	taskID := decode[map[string]any](t, body)["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/projects/"+projectB+"/milestones", `{"name":"另一项目里程碑"}`)
	milestoneID := decode[map[string]any](t, body)["id"].(string)

	res, body := e.do(t, http.MethodDelete, "/api/tasks/"+taskID+"/milestones/"+milestoneID, "")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("跨项目解除里程碑应 400，实际 %d: %s", res.StatusCode, body)
	}
	if _, ok := decode[map[string]any](t, body)["error"]; !ok {
		t.Fatalf("400 响应应为 {error} 信封，实际 %s", body)
	}
}

// TestProjectPinned 校验项目置顶闭环：置顶→列出→取消。
func TestProjectPinned(t *testing.T) {
	e := newTestEnv(t)
	projectID := createProject(t, e, "置顶测试项目")

	_, body := e.do(t, http.MethodGet, "/api/pinned-projects", "")
	if items := decode[[]map[string]any](t, body); len(items) != 0 {
		t.Fatalf("初始置顶应为空，实际 %d", len(items))
	}

	res, _ := e.do(t, http.MethodPost, "/api/projects/"+projectID+"/pinned", `{"pinned":true}`)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("置顶应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/pinned-projects", "")
	items := decode[[]map[string]any](t, body)
	if len(items) != 1 || items[0]["projectId"] != projectID {
		t.Fatalf("置顶后应含该项目，实际 %v", items)
	}

	res, _ = e.do(t, http.MethodPost, "/api/projects/"+projectID+"/pinned", `{"pinned":false}`)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("取消置顶应 204，实际 %d", res.StatusCode)
	}
	_, body = e.do(t, http.MethodGet, "/api/pinned-projects", "")
	if items := decode[[]map[string]any](t, body); len(items) != 0 {
		t.Fatalf("取消后应为空，实际 %v", items)
	}
}
