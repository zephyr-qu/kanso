// httpapi 500 分支测试：service 层 DB 故障时 handler 正确返回 500。
// 这些用例只保留 HTTP 层职责：验证错误映射与响应状态；service 的具体
// SQL 错误传播和业务分支由 internal/service 的测试负责。
// 用 sqlmock 注入 *sql.DB 构造 router；认证/actor 查询先 mock 成功，再让目标查询失败。
package httpapi_test

import (
	"database/sql/driver"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"kanso/internal/config"
	"kanso/internal/httpapi"
	"kanso/internal/realtime"
	"kanso/internal/service"
)

var memberRowCols = []string{"id", "workspace_id", "name", "role", "avatar_color", "avatar", "access_key", "created_at"}

func memberRow(id string) []driver.Value {
	return []driver.Value{id, "w1", "Admin", "owner", nil, nil, "mock-key", "2026-01-01"}
}

// expectAuth mocks 认证查询（GetMemberByAccessKey）+ actor 查询（GetMember）成功。
func expectAuth(mock sqlmock.Sqlmock, memberID string) {
	mock.ExpectQuery("FROM member WHERE access_key").
		WillReturnRows(sqlmock.NewRows(memberRowCols).
			AddRow(memberRow(memberID)...))
	mock.ExpectQuery("FROM member WHERE id").
		WillReturnRows(sqlmock.NewRows(memberRowCols).
			AddRow(memberRow(memberID)...))
}

// newMockRouter 构造注入 sqlmock 的完整 router（含认证中间件）。
func newMockRouter(t *testing.T) (*httptest.Server, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock 创建失败: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("未满足的 sqlmock 期望: %v", err)
		}
	})
	svc := service.New(db, config.ModeTeam)
	cfg := config.Config{Addr: "127.0.0.1:0", AccessKey: "mock-key", Mode: config.ModeTeam}
	srv := httptest.NewServer(httpapi.NewRouter(cfg, svc, realtime.NewHub()))
	t.Cleanup(srv.Close)
	return srv, mock
}

func TestHandler500Paths(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		failSQL func(mock sqlmock.Sqlmock)
	}{
		{
			name: "dashboard", method: http.MethodGet, path: "/api/dashboard",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("ListColumnDistributions").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "activity", method: http.MethodGet, path: "/api/activity",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("ListActivitiesWithProject").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "backup", method: http.MethodGet, path: "/api/settings/backup",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("FROM member WHERE id").
					WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "me", method: http.MethodGet, path: "/api/me",
			failSQL: func(m sqlmock.Sqlmock) {
				// actor 中间件已消耗一次 GetMember；getMe 内的 GetMember 再失败。
				m.ExpectQuery("FROM member WHERE id").WillReturnError(errors.New("db down"))
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
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s 应 500，实际 %d", tc.name, res.StatusCode)
			}
		})
	}
}

// TestHandler500WriteOps 覆盖写操作 handler 的 500 分支（service 事务失败）。
func TestHandler500WriteOps(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		failSQL func(mock sqlmock.Sqlmock)
	}{
		{
			name: "createLabel", method: http.MethodPost, path: "/api/projects/p1/labels",
			body: `{"name":"标签"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "updateLabel", method: http.MethodPatch, path: "/api/labels/l1",
			body: `{"name":"x"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "deleteLabel", method: http.MethodDelete, path: "/api/labels/l1",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "createMember", method: http.MethodPost, path: "/api/members",
			body: `{"workspaceId":"w1","name":"成员"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				// requireOwner 的 GetMember（第三次）。
				m.ExpectQuery("FROM member WHERE id").
					WillReturnRows(sqlmock.NewRows(memberRowCols).
						AddRow(memberRow("m1")...))
				// GetWorkspace 成功，成员统计失败 → 500。
				m.ExpectQuery("FROM workspace WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "name", "created_at"}).
						AddRow("w1", "工作区", "2026-01-01"))
				m.ExpectQuery("FROM member WHERE workspace_id").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "createWorkspace", method: http.MethodPost, path: "/api/workspaces",
			body: `{"name":"工作区"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("CreateWorkspace").WillReturnError(errors.New("db down"))
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
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s 应 500，实际 %d", tc.name, res.StatusCode)
			}
		})
	}
}

// TestHandler500More 覆盖其余写/读操作 handler 的 500 分支。
func TestHandler500More(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		failSQL func(mock sqlmock.Sqlmock)
	}{
		{
			name: "attachLabel", method: http.MethodPost, path: "/api/tasks/t1/labels/l1",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "detachLabel", method: http.MethodDelete, path: "/api/tasks/t1/labels/l1",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "listMembers", method: http.MethodGet, path: "/api/workspaces/w1/members",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("ListMembersByWorkspace").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "createMilestone", method: http.MethodPost, path: "/api/projects/p1/milestones",
			body: `{"name":"里程碑"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "updateMilestone", method: http.MethodPatch, path: "/api/milestones/ms1",
			body: `{"name":"x"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "deleteMilestone", method: http.MethodDelete, path: "/api/milestones/ms1",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
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
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s 应 500，实际 %d", tc.name, res.StatusCode)
			}
		})
	}
}

// TestHandler500ReadOps 覆盖读/简单写操作 handler 的 500 分支。
func TestHandler500ReadOps(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		failSQL func(mock sqlmock.Sqlmock)
	}{
		{
			name: "listProjects", method: http.MethodGet, path: "/api/workspaces/w1/projects",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("ListProjectsByWorkspace").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "renameProject", method: http.MethodPatch, path: "/api/projects/p1",
			body: `{"name":"x"}`,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("UpdateProjectName").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "searchTasks", method: http.MethodGet, path: "/api/search?q=abc",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("SearchTasks").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "deleteComment", method: http.MethodDelete, path: "/api/comments/c1",
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
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
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s 应 500，实际 %d", tc.name, res.StatusCode)
			}
		})
	}
}

// TestRequireOwnerServerError 覆盖 requireOwner 的 DB 故障 → 500 分支。
func TestRequireOwnerServerError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	// requireOwner 的 GetMember 失败（非 ErrNoRows）→ 500。
	mock.ExpectQuery("FROM member WHERE id").WillReturnError(errors.New("db down"))

	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/members/other", nil)
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("requireOwner DB 故障应 500，实际 %d", res.StatusCode)
	}
}

// TestUpdateColumn500 覆盖 updateColumn 的移动/重命名 500 分支。
func TestUpdateColumn500(t *testing.T) {
	cases := []struct {
		name string
		body string
		mock func(m sqlmock.Sqlmock)
	}{
		{
			name: "move", body: `{"position":1}`,
			mock: func(m sqlmock.Sqlmock) {
				m.ExpectBegin().WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "rename", body: `{"name":"x"}`,
			mock: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("UpdateColumnName").WillReturnError(errors.New("db down"))
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			tc.mock(mock)

			req, _ := http.NewRequest(http.MethodPatch, srv.URL+"/api/columns/c1", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer mock-key")
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s 应 500，实际 %d", tc.name, res.StatusCode)
			}
		})
	}
}
