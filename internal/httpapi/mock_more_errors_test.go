// API 层 sqlmock 测试：验证评论/标签/列/备份 handler 的 HTTP 错误映射。
// 不在这里重复断言 service 的内部实现细节；service 本身的错误分支见
// internal/service/service_sqlmock_test.go。
package httpapi_test

import (
	"database/sql"
	"database/sql/driver"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// taskRow 返回任务行（GetTask 成功用）。
func taskRow() []driver.Value {
	return []driver.Value{"t1", "p1", "c1", "标题", nil, 0, "med", nil, nil, "2026-01-01", "2026-01-01"}
}

var taskCols = []string{"id", "project_id", "column_id", "title", "description", "position", "priority", "due_date", "archived_at", "created_at", "updated_at"}

// expectTaskExists mock GetTask 成功。
func expectTaskExists(m sqlmock.Sqlmock) {
	m.ExpectQuery("FROM task WHERE id").
		WillReturnRows(sqlmock.NewRows(taskCols).AddRow(taskRow()...))
}

// TestCommentLabelServiceErrors 覆盖评论/标签 handler 的 service 内部失败点。
func TestCommentLabelServiceErrors(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "评论任务不存在404", method: http.MethodPost, path: "/api/tasks/t1/comments",
			body: `{"content":"c"}`, want: http.StatusNotFound,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM task WHERE id").WillReturnError(sql.ErrNoRows)
				m.ExpectRollback()
			},
		},
		{
			name: "评论插入失败500", method: http.MethodPost, path: "/api/tasks/t1/comments",
			body: `{"content":"c"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectTaskExists(m)
				m.ExpectQuery("INSERT INTO comment").WillReturnError(errors.New("db down"))
				m.ExpectRollback()
			},
		},
		{
			name: "贴标签任务不存在404", method: http.MethodPost, path: "/api/tasks/t1/labels/l1",
			want: http.StatusNotFound,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				m.ExpectQuery("FROM task WHERE id").WillReturnError(sql.ErrNoRows)
				m.ExpectRollback()
			},
		},
		{
			name: "贴标签标签不存在404", method: http.MethodPost, path: "/api/tasks/t1/labels/l1",
			want: http.StatusNotFound,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectTaskExists(m)
				m.ExpectQuery("FROM label WHERE id").WillReturnError(sql.ErrNoRows)
				m.ExpectRollback()
			},
		},
		{
			name: "贴标签插入失败500", method: http.MethodPost, path: "/api/tasks/t1/labels/l1",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectBegin()
				expectTaskExists(m)
				m.ExpectQuery("FROM label WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "created_at"}).
						AddRow("l1", "p1", "标签", "2026-01-01"))
				m.ExpectExec("INSERT OR IGNORE INTO task_label").WillReturnError(errors.New("db down"))
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

// TestColumnServiceErrors 覆盖列 handler 的 service 内部失败点。
func TestColumnServiceErrors(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		body    string
		want    int
		failSQL func(m sqlmock.Sqlmock)
	}{
		{
			name: "创建列最大位置失败500", method: http.MethodPost, path: "/api/projects/p1/columns",
			body: `{"name":"列"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("FROM project WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
						AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("MaxColumnPositionByProject").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "创建列插入失败500", method: http.MethodPost, path: "/api/projects/p1/columns",
			body: `{"name":"列"}`, want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				m.ExpectQuery("FROM project WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
						AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
				m.ExpectQuery("MaxColumnPositionByProject").
					WillReturnRows(sqlmock.NewRows([]string{"position"}).AddRow(0))
				m.ExpectQuery("INSERT INTO column").WillReturnError(errors.New("db down"))
			},
		},
		{
			name: "删除列清活动失败500", method: http.MethodDelete, path: "/api/columns/c1",
			want: http.StatusInternalServerError,
			failSQL: func(m sqlmock.Sqlmock) {
				// requireOwnerInTeam 的 GetMember（第三次）。
				m.ExpectQuery("FROM member WHERE id").
					WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
				m.ExpectBegin()
				m.ExpectQuery("FROM column WHERE id").
					WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "position", "wip_limit", "created_at"}).
						AddRow("c1", "p1", "列", 0, nil, "2026-01-01"))
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

// TestBackupExportError 覆盖 GetBackup 中途导出失败的 500 分支。
func TestBackupExportError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").
		WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
	mock.ExpectBegin()
	mock.ExpectQuery("ListWorkspaces").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "created_at"}).AddRow("w1", "工作区", "2026-01-01"))
	mock.ExpectQuery("ListAllProjects").WillReturnError(errors.New("db down"))
	mock.ExpectRollback()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/settings/backup", nil)
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("导出中断应 500，实际 %d", res.StatusCode)
	}
}
