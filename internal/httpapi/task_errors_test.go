// API 层 sqlmock 测试：验证任务 handler 将 service 错误映射为正确的 HTTP 响应。
// service 内部各失败点本身由 internal/service 的测试负责；这里不以业务覆盖率
// 为目标，而是保护 API 的状态码契约。
package httpapi_test

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// createTaskRequest 带认证发送任务创建请求。
func createTaskReq(t *testing.T, srv *httptest.Server, path, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

// expectColumnExists mock GetColumn 成功。
func expectColumnExists(m sqlmock.Sqlmock) {
	m.ExpectQuery("FROM column WHERE id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "position", "wip_limit", "created_at"}).
			AddRow("c1", "p1", "待办", 0, nil, "2026-01-01"))
}

// TestCreateTaskServiceErrors 覆盖 CreateTask 内部各失败点。
func TestCreateTaskServiceErrors(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "列不存在404", body: `{"title":"t"}`, want: http.StatusNotFound,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM column WHERE id").WillReturnError(sql.ErrNoRows)
				m.ExpectRollback()
			},
		},
		{
			name: "最大位置查询失败500", body: `{"title":"t"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectColumnExists(m)
				m.ExpectQuery("MaxTaskPositionByColumn").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
		{
			name: "创建查询失败500", body: `{"title":"t"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectColumnExists(m)
				m.ExpectQuery("MaxTaskPositionByColumn").
					WillReturnRows(sqlmock.NewRows([]string{"position"}).AddRow(0))
				m.ExpectQuery("INSERT INTO task").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
		{
			name: "标签不存在400", body: `{"title":"t","labels":["l1"]}`, want: http.StatusBadRequest,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectColumnExists(m)
				m.ExpectQuery("MaxTaskPositionByColumn").
					WillReturnRows(sqlmock.NewRows([]string{"position"}).AddRow(0))
				m.ExpectQuery("INSERT INTO task").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "column_id", "title", "description", "position", "priority", "due_date", "archived_at", "created_at", "updated_at"}).
						AddRow("t1", "p1", "c1", "t", nil, 0, "med", nil, nil, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("FROM label WHERE id").WillReturnError(sql.ErrNoRows)
				m.ExpectRollback()
			},
		},
		{
			name: "跨项目标签400", body: `{"title":"t","labels":["l1"]}`, want: http.StatusBadRequest,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectColumnExists(m)
				m.ExpectQuery("MaxTaskPositionByColumn").
					WillReturnRows(sqlmock.NewRows([]string{"position"}).AddRow(0))
				m.ExpectQuery("INSERT INTO task").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "column_id", "title", "description", "position", "priority", "due_date", "archived_at", "created_at", "updated_at"}).
						AddRow("t1", "p1", "c1", "t", nil, 0, "med", nil, nil, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("FROM label WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "created_at"}).
						AddRow("l1", "OTHER-PROJECT", "标签", "2026-01-01"))
				m.ExpectRollback()
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			tc.failSQL(mock)

			res := createTaskReq(t, srv, "/api/columns/c1/tasks", tc.body)
			if res.StatusCode != tc.want {
				t.Fatalf("应 %d，实际 %d", tc.want, res.StatusCode)
			}
		})
	}
}

// TestTaskWriteServiceErrors 覆盖任务更新/归档/删除的 service 失败分支。
func TestTaskWriteServiceErrors(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "更新BeginTx失败500", method: http.MethodPatch, path: "/api/tasks/t1",
			body: `{"title":"x"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "归档BeginTx失败500", method: http.MethodPost, path: "/api/tasks/t1/archive",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "恢复BeginTx失败500", method: http.MethodPost, path: "/api/tasks/t1/restore",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "删除活动失败500", method: http.MethodDelete, path: "/api/tasks/t1",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				// DeleteTask 在事务内：GetTask 成功 → 删活动失败 → 回滚 → 500。
				m.ExpectBegin()
				m.ExpectQuery("FROM task WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "column_id", "title", "description", "position", "priority", "due_date", "archived_at", "created_at", "updated_at"}).
						AddRow("t1", "p1", "c1", "t", nil, 0, "med", nil, nil, "2026-01-01", "2026-01-01"))
				m.ExpectExec("DELETE FROM activity").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			tc.failSQL(mock)

			req, err := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", "Bearer mock-key")
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.want {
				t.Fatalf("应 %d，实际 %d", tc.want, res.StatusCode)
			}
		})
	}
}
