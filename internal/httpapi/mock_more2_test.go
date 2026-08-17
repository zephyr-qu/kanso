// API 层 sqlmock 测试：列移动/WIP/评论删除/归档列表的 service 内部失败点。
package httpapi_test

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// TestColumnMoveWIPErrors 覆盖列移动/WIP/重命名的失败分支。
func TestColumnMoveWIPErrors(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "WIP更新失败400", method: http.MethodPatch, path: "/api/columns/c1",
			body: `{"wipLimit":5}`, want: http.StatusBadRequest,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("UpdateColumnWIP").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "列移动定位失败500", method: http.MethodPatch, path: "/api/columns/c1",
			body: `{"position":1}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM column WHERE id").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
		{
			name: "列重命名失败500", method: http.MethodPatch, path: "/api/columns/c1",
			body: `{"name":"x"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("UpdateColumnName").WillReturnError(errors.New("db down"))
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

// TestCommentDeleteError 覆盖删除评论的 service 失败分支。
func TestCommentDeleteError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	// DeleteComment：BeginTx → GetComment → DeleteComment → recordEvent → Commit。
	mock.ExpectBegin()
	mock.ExpectQuery("FROM comment WHERE id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "task_id", "author", "content", "created_at"}).
			AddRow("c1", "t1", "Admin", "内容", "2026-01-01"))
	expectTaskExists(mock)
	mock.ExpectExec("DELETE FROM comment").WillReturnError(errors.New("db down"))
	mock.ExpectRollback()

	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/comments/c1", nil)
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("删除评论失败应 500，实际 %d", res.StatusCode)
	}
}

// TestArchivedTasksError 覆盖归档列表查询失败分支。
func TestArchivedTasksError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM project WHERE id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
			AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
	mock.ExpectQuery("ListArchivedTasksByProject").WillReturnError(errors.New("db down"))

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/projects/p1/archived-tasks", nil)
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("归档查询失败应 500，实际 %d", res.StatusCode)
	}
}

// TestMilestoneWriteErrors 覆盖里程碑写操作失败分支。
func TestMilestoneWriteErrors(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "创建里程碑插入失败500", method: http.MethodPost, path: "/api/projects/p1/milestones",
			body: `{"name":"里程碑"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM project WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
						AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("INSERT INTO milestone").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
		{
			name: "更新里程碑失败500", method: http.MethodPatch, path: "/api/milestones/ms1",
			body: `{"name":"x"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM milestone WHERE id").WillReturnError(errors.New("db down"))
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

// TestFinalHandler500 覆盖剩余 handler 的 500 防御分支。
func TestFinalHandler500(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "getMe查询失败500", method: http.MethodGet, path: "/api/me",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				// actor 中间件已消耗一次 GetMember；getMe 内的 GetMember 失败。
				m.ExpectQuery("FROM member WHERE id").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "看板任务查询失败500", method: http.MethodGet, path: "/api/projects/p1",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("FROM project WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
						AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("ListColumnsByProject").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "position", "wip_limit", "created_at"}).
						AddRow("c1", "p1", "待办", 0, nil, "2026-01-01"))
				m.ExpectQuery("ListTasksByProject").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "详情标签查询失败500", method: http.MethodGet, path: "/api/tasks/t1",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				expectTaskExists(m)
				m.ExpectQuery("ListTaskLabelsByTask").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "成员列表失败500", method: http.MethodGet, path: "/api/workspaces/w1/members",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("ListMembersByWorkspace").WillReturnError(errors.New("db down"))
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
				t.Fatalf("%s 应 %d，实际 %d", tc.name, tc.want, res.StatusCode)
			}
		})
	}
}
