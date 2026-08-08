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

// TestProjectSeedsDefaultColumns 校验建项目自动种子默认列。
// 注：聚合接口（GET /api/projects/:id）在 04 落地，届时此处改为 API 断言。
func TestProjectSeedsDefaultColumns(t *testing.T) {
	e := newTestEnv(t)
	_, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	workspaceID := decode[[]map[string]any](t, body)[0]["id"].(string)

	res, body := e.do(t, http.MethodPost, "/api/workspaces/"+workspaceID+"/projects", `{"name":"种子项目"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("创建项目应 201，实际 %d", res.StatusCode)
	}
	projectID := decode[map[string]any](t, body)["id"].(string)

	var count int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM "column" WHERE project_id = ?`, projectID).Scan(&count); err != nil {
		t.Fatalf("读取默认列失败: %v", err)
	}
	if count != 3 {
		t.Fatalf("应种子 3 个默认列，实际 %d", count)
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
