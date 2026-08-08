// API 缝测试（spec 唯一测试缝）：挂载真实路由 + 临时目录真实 SQLite（真实迁移与种子），
// 全部通过 HTTP 断言外部行为。唯一例外：默认列种子在 04 聚合接口落地前，用测试自有
// 临时库直接读库校验副作用（见 TestProjectSeedsDefaultColumns）。
package httpapi_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
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
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	svc := service.New(database)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatalf("种子默认工作区失败: %v", err)
	}
	cfg := config.Config{Addr: "127.0.0.1:0", AccessKey: testKey}
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc, realtime.NewHub()))
	t.Cleanup(srv.Close)
	return &testEnv{srv: srv, db: database}
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
	if len(columns) != 3 {
		t.Fatalf("应种子 3 个默认列，实际 %d", len(columns))
	}
}

// TestWorkspaceDeleteCascadesProjects 验证删除工作区级联删除项目（读回无残留）。
func TestWorkspaceDeleteCascadesProjects(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 建项目 + 任务（产生 task.created 活动）。
	projectID := createProject(t, e, "将被级联")
	_, body = e.do(t, http.MethodGet, "/api/projects/"+projectID, "")
	columnID := decode[map[string]any](t, body)["columns"].([]any)[0].(map[string]any)["id"].(string)
	e.do(t, http.MethodPost, "/api/columns/"+columnID+"/tasks", `{"title":"级联任务"}`)

	if res, _ := e.do(t, http.MethodDelete, "/api/workspaces/"+workspaceID, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("删除工作区应 204，实际 %d", res.StatusCode)
	}

	var projectCount int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM project`).Scan(&projectCount); err != nil {
		t.Fatalf("统计项目失败: %v", err)
	}
	if projectCount != 0 {
		t.Fatalf("级联后应无残留项目，实际 %d", projectCount)
	}

	var columnCount int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM "column"`).Scan(&columnCount); err != nil {
		t.Fatalf("统计列失败: %v", err)
	}
	if columnCount != 0 {
		t.Fatalf("级联后应无残留列，实际 %d", columnCount)
	}

	// spec 必测：删工作区后活动也应消失（无孤儿记录）。
	var activityCount int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM activity`).Scan(&activityCount); err != nil {
		t.Fatalf("统计活动失败: %v", err)
	}
	if activityCount != 0 {
		t.Fatalf("级联后应无残留活动，实际 %d", activityCount)
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
	if len(columns) != 3 {
		t.Fatalf("应 3 列，实际 %d", len(columns))
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
	if column["position"].(float64) != 3 {
		t.Fatalf("新列应追加到 position 3，实际 %v", column["position"])
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
	want := []string{"进行中", "已完成", "待办"}
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

// TestLabelLifecycle 覆盖工作区级标签 CRUD。
func TestLabelLifecycle(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	// 创建。
	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/labels", `{"name":"紧急","color":"#ef4444"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建标签应 201，实际 %d", res.StatusCode)
	}
	label := decode[map[string]any](t, body)
	labelID := label["id"].(string)
	if label["color"] != "#ef4444" {
		t.Fatalf("标签颜色错误: %v", label["color"])
	}

	// 列表。
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/labels", "")
	if got := len(decode[[]map[string]any](t, body)); got != 1 {
		t.Fatalf("应 1 个标签，实际 %d", got)
	}

	// 部分更新（只改名称）。
	res, body = e.do(t, http.MethodPatch, "/api/labels/"+labelID, `{"name":"特急"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("更新标签应 200，实际 %d", res.StatusCode)
	}
	updated := decode[map[string]any](t, body)
	if updated["name"] != "特急" || updated["color"] != "#ef4444" {
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

	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	_, body = e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/labels", `{"name":"前端","color":"#3b82f6"}`)
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

	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)
	e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/labels", `{"name":"标记"}`)

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
	_, body = e.do(t, http.MethodGet, "/api/workspaces/"+workspaceID+"/labels", "")
	labelID := decode[[]map[string]any](t, body)[0]["id"].(string)
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
