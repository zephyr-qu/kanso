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

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/httpapi"
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
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc))
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

	e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"将被级联"}`)

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
