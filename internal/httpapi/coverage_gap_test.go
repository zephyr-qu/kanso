package httpapi_test

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"kanso/internal/config"
)

// TestBackupImportRejectsMalformedSnapshots covers the destructive-import
// validation branches before the service is called.
func TestBackupImportRejectsMalformedSnapshots(t *testing.T) {
	e := newTestEnv(t)

	for _, body := range []string{"{", `{"projects":[]}`} {
		res, _ := e.do(t, http.MethodPost, "/api/settings/backup", body)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("malformed backup %q should return 400, got %d", body, res.StatusCode)
		}
	}
}

func TestDeleteLastWorkspaceIsRejected(t *testing.T) {
	e := newTestEnv(t)
	res, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list workspaces should return 200, got %d", res.StatusCode)
	}
	workspaces := decode[[]struct {
		ID string `json:"id"`
	}](t, body)
	if len(workspaces) != 1 {
		t.Fatalf("test environment should start with one workspace, got %d", len(workspaces))
	}

	res, _ = e.do(t, http.MethodDelete, "/api/workspaces/"+workspaces[0].ID, "")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("deleting the last workspace should return 400, got %d", res.StatusCode)
	}
}

func TestMemberCannotDeleteWorkspace(t *testing.T) {
	e := newTestEnv(t)
	res, body := e.do(t, http.MethodGet, "/api/workspaces", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list workspaces should return 200, got %d", res.StatusCode)
	}
	workspaces := decode[[]struct {
		ID string `json:"id"`
	}](t, body)

	res, body = e.do(t, http.MethodPost, "/api/members", `{"workspaceId":"`+workspaces[0].ID+`","name":"Member Test"}`)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("creating member should return 201, got %d", res.StatusCode)
	}
	member := decode[struct {
		ID string `json:"id"`
	}](t, body)
	res, body = e.do(t, http.MethodPost, "/api/members/"+member.ID+"/key", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("creating member key should return 200, got %d", res.StatusCode)
	}
	key := decode[struct {
		Key string `json:"key"`
	}](t, body).Key
	if key == "" {
		t.Fatalf("created member should have an access key")
	}

	res, _ = e.doAuth(t, key, http.MethodDelete, "/api/workspaces/"+workspaces[0].ID, "")
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("member deleting workspace should return 403, got %d", res.StatusCode)
	}
}

func TestListWorkspacesDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("ListWorkspaces").WillReturnError(errors.New("db down"))

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/workspaces", strings.NewReader(""))
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
		t.Fatalf("database error should return 500, got %d", res.StatusCode)
	}
}

func TestBackupImportDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").
		WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
	mock.ExpectBegin().WillReturnError(errors.New("db down"))

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/settings/backup", strings.NewReader(`{"workspaces":[{"id":"w1","name":"Workspace","created_at":"2026-01-01"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	req.Header.Set("Content-Type", "application/json")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("backup database error should return 500, got %d", res.StatusCode)
	}
}

func TestValidationErrorsForMemberAndMilestone(t *testing.T) {
	e := newTestEnv(t)
	for _, tc := range []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/api/members", `{"workspaceId":"","name":"x"}`},
		{http.MethodPost, "/api/members", `{"workspaceId":"w1","name":""}`},
		{http.MethodPatch, "/api/members/nope", `{"avatar":123}`},
		{http.MethodPost, "/api/projects/nope/milestones", `{"name":""}`},
		{http.MethodPatch, "/api/milestones/nope", `{"name":""}`},
	} {
		res, _ := e.do(t, tc.method, tc.path, tc.body)
		if res.StatusCode != http.StatusBadRequest && res.StatusCode != http.StatusNotFound {
			t.Fatalf("%s %s should reject invalid input, got %d", tc.method, tc.path, res.StatusCode)
		}
	}
}

func TestMalformedAndBoundaryPayloads(t *testing.T) {
	e := newTestEnv(t)
	cases := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/api/workspaces", "{"},
		{http.MethodPost, "/api/workspaces/w1/projects", "{"},
		{http.MethodPost, "/api/projects/p1/columns", `{"name":"x","wipLimit":-1}`},
		{http.MethodPatch, "/api/columns/c1", `{"wipLimit":"bad"}`},
		{http.MethodPatch, "/api/columns/c1", `{"position":null}`},
		{http.MethodPatch, "/api/columns/nope", `{"wipLimit":1}`},
		{http.MethodPatch, "/api/columns/nope", `{"position":1}`},
		{http.MethodPost, "/api/columns/c1/tasks", `{"title":""}`},
		{http.MethodPatch, "/api/tasks/t1", `{"title":""}`},
		{http.MethodPost, "/api/workspaces/w1/projects", `{"name":""}`},
		{http.MethodPost, "/api/projects/p1/milestones", "{"},
		{http.MethodPatch, "/api/milestones/m1", "{"},
		{http.MethodPatch, "/api/labels/l1", "{"},
		{http.MethodPut, "/api/settings/config", "{"},
		{http.MethodPatch, "/api/workspaces/w1", "{"},
	}
	for _, tc := range cases {
		res, _ := e.do(t, tc.method, tc.path, tc.body)
		if res.StatusCode != http.StatusBadRequest && res.StatusCode != http.StatusNotFound {
			t.Fatalf("%s %s should return 400 or 404, got %d", tc.method, tc.path, res.StatusCode)
		}
	}
}

func TestAdditionalNotFoundBranches(t *testing.T) {
	e := newTestEnv(t)
	cases := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodDelete, "/api/tasks/nope/labels/nope", ""},
		{http.MethodPost, "/api/tasks/nope/labels/nope", ""},
		{http.MethodPost, "/api/projects/nope/labels", `{"name":"x"}`},
		{http.MethodPost, "/api/workspaces/nope/projects", `{"name":"x"}`},
		{http.MethodPost, "/api/members", "{"},
		{http.MethodPost, "/api/members", `{"workspaceId":"nope","name":"x"}`},
	}
	for _, tc := range cases {
		res, _ := e.do(t, tc.method, tc.path, tc.body)
		if res.StatusCode != http.StatusBadRequest && res.StatusCode != http.StatusNotFound && res.StatusCode != http.StatusInternalServerError {
			t.Fatalf("%s %s should return an expected client/service error, got %d", tc.method, tc.path, res.StatusCode)
		}
	}
}

func TestPersonalModeDestructiveRouteSkipsTeamOwnerCheck(t *testing.T) {
	e := newTestEnvMode(t, config.ModePersonal)
	res, _ := e.do(t, http.MethodDelete, "/api/projects/does-not-exist", "")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("personal mode should reach project deletion handler, got %d", res.StatusCode)
	}
}

func TestMemberSelfUpdateRejectsMalformedAvatar(t *testing.T) {
	e := newTestEnv(t)
	res, body := e.do(t, http.MethodGet, "/api/me", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me should return 200, got %d", res.StatusCode)
	}
	me := decode[struct {
		Member struct {
			ID string `json:"id"`
		} `json:"member"`
	}](t, body)
	res, _ = e.do(t, http.MethodPatch, "/api/members/"+me.Member.ID, `{"avatar":123}`)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("malformed avatar should return 400, got %d", res.StatusCode)
	}
	res, _ = e.do(t, http.MethodPatch, "/api/members/"+me.Member.ID, "{")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("malformed member body should return 400, got %d", res.StatusCode)
	}
}

func TestDeleteWorkspaceDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
	mock.ExpectBegin()
	workspaceCols := []string{"id", "name", "created_at"}
	mock.ExpectQuery("FROM workspace WHERE id").WillReturnRows(sqlmock.NewRows(workspaceCols).AddRow("w1", "Workspace", "2026-01-01"))
	mock.ExpectQuery("CountWorkspaces").WillReturnRows(sqlmock.NewRows([]string{"COUNT(*)"}).AddRow(2))
	mock.ExpectExec("DeleteActivitiesByWorkspace").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DeleteWorkspace").WillReturnError(errors.New("db down"))
	mock.ExpectRollback()

	req, err := http.NewRequest(http.MethodDelete, srv.URL+"/api/workspaces/w1", nil)
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
		t.Fatalf("workspace delete database error should return 500, got %d", res.StatusCode)
	}
}

func TestRequireOwnerLookupErrors(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want int
	}{
		{"missing", sql.ErrNoRows, http.StatusUnauthorized},
		{"database", errors.New("db down"), http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			mock.ExpectQuery("FROM member WHERE id").WillReturnError(tc.err)
			req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/members", strings.NewReader(`{"workspaceId":"w1","name":"New"}`))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", "Bearer mock-key")
			req.Header.Set("Content-Type", "application/json")
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.want {
				t.Fatalf("%s owner lookup should return %d, got %d", tc.name, tc.want, res.StatusCode)
			}
		})
	}
}

func TestTaskMoveLookupErrors(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want int
	}{
		{"missing", sql.ErrNoRows, http.StatusNotFound},
		{"database", errors.New("db down"), http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			mock.ExpectBegin()
			mock.ExpectQuery("FROM task WHERE id").WillReturnError(tc.err)
			mock.ExpectRollback()
			req, err := http.NewRequest(http.MethodPatch, srv.URL+"/api/tasks/t1", strings.NewReader(`{"columnId":"c2"}`))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", "Bearer mock-key")
			req.Header.Set("Content-Type", "application/json")
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.want {
				t.Fatalf("%s task move should return %d, got %d", tc.name, tc.want, res.StatusCode)
			}
		})
	}
}

func TestListMilestonesDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM project WHERE id").WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).AddRow("p1", "w1", "Project", 0, "2026-01-01", "2026-01-01"))
	mock.ExpectQuery("ListMilestonesByProject").WillReturnError(errors.New("db down"))

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/projects/p1/milestones", nil)
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
		t.Fatalf("milestone query error should return 500, got %d", res.StatusCode)
	}
}

func TestGetMeMemberNotFound(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").WillReturnError(sql.ErrNoRows)

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/me", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("missing current member should return 404, got %d", res.StatusCode)
	}
}

func TestMemberCannotManageMembers(t *testing.T) {
	srv, mock := newMockRouter(t)
	mock.ExpectQuery("FROM member WHERE access_key").WillReturnRows(sqlmock.NewRows(memberRowCols).
		AddRow("m1", "w1", "Member", "member", nil, nil, "mock-key", "2026-01-01"))
	mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).
		AddRow("m1", "w1", "Member", "member", nil, nil, "mock-key", "2026-01-01"))
	mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).
		AddRow("m1", "w1", "Member", "member", nil, nil, "mock-key", "2026-01-01"))

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/api/members", strings.NewReader(`{"workspaceId":"w1","name":"Other"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	req.Header.Set("Content-Type", "application/json")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("member managing members should return 403, got %d", res.StatusCode)
	}
}

func TestDeleteProjectDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).
		AddRow(memberRow("m1")...))
	mock.ExpectBegin()
	mock.ExpectExec("DeleteActivitiesByProject").WillReturnError(errors.New("db down"))
	mock.ExpectRollback()

	req, err := http.NewRequest(http.MethodDelete, srv.URL+"/api/projects/p1", nil)
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
		t.Fatalf("project delete database error should return 500, got %d", res.StatusCode)
	}
}

func TestSettingsConfigWriteFailure(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config-dir")
	if err := os.Mkdir(configPath, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KANSO_CONFIG_FILE", configPath)
	e := newTestEnv(t)
	res, _ := e.do(t, http.MethodPut, "/api/settings/config", `{"addr":":8080","dataDir":"./data"}`)
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("config write failure should return 500, got %d", res.StatusCode)
	}
}

func TestMemberManagementDatabaseErrors(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"create", http.MethodPost, "/api/members", `{"workspaceId":"w1","name":"New"}`},
		{"delete", http.MethodDelete, "/api/members/m2", ""},
		{"key", http.MethodPost, "/api/members/m2/key", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
			if tc.name == "create" {
				mock.ExpectQuery("FROM workspace WHERE id").WillReturnError(errors.New("db down"))
			} else {
				mock.ExpectQuery("FROM member WHERE id").WillReturnError(errors.New("db down"))
			}
			req, err := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Authorization", "Bearer mock-key")
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusInternalServerError {
				t.Fatalf("%s database error should return 500, got %d", tc.name, res.StatusCode)
			}
		})
	}
}

func TestMilestoneAssociationDatabaseErrors(t *testing.T) {
	for _, attached := range []bool{true, false} {
		name := "detach"
		method := http.MethodDelete
		if attached {
			name = "attach"
			method = http.MethodPost
		}
		t.Run(name, func(t *testing.T) {
			srv, mock := newMockRouter(t)
			expectAuth(mock, "m1")
			mock.ExpectBegin()
			mock.ExpectQuery("FROM task WHERE id").WillReturnRows(sqlmock.NewRows(taskCols).AddRow(taskRow()...))
			mock.ExpectQuery("FROM milestone WHERE id").WillReturnRows(sqlmock.NewRows([]string{"id", "project_id", "name", "due_date", "created_at"}).AddRow("ms1", "p1", "Milestone", nil, "2026-01-01"))
			if attached {
				mock.ExpectExec("AttachTaskMilestone").WillReturnError(errors.New("db down"))
			} else {
				mock.ExpectExec("DetachTaskMilestone").WillReturnError(errors.New("db down"))
			}
			mock.ExpectRollback()
			path := "/api/tasks/t1/milestones/ms1"
			req, err := http.NewRequest(method, srv.URL+path, nil)
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
				t.Fatalf("%s database error should return 500, got %d", name, res.StatusCode)
			}
		})
	}
}

func TestWorkspaceRenameDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("UpdateWorkspaceName").WillReturnError(errors.New("db down"))

	req, err := http.NewRequest(http.MethodPatch, srv.URL+"/api/workspaces/w1", strings.NewReader(`{"name":"Renamed"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	req.Header.Set("Content-Type", "application/json")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("workspace rename database error should return 500, got %d", res.StatusCode)
	}
}

func TestDeleteProjectOperationDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectQuery("FROM member WHERE id").WillReturnRows(sqlmock.NewRows(memberRowCols).AddRow(memberRow("m1")...))
	mock.ExpectBegin()
	mock.ExpectExec("DeleteActivitiesByProject").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("DeleteProject").WillReturnError(errors.New("db down"))
	mock.ExpectRollback()

	req, err := http.NewRequest(http.MethodDelete, srv.URL+"/api/projects/p1", nil)
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
		t.Fatalf("project delete operation error should return 500, got %d", res.StatusCode)
	}
}

func TestTaskUpdateDatabaseError(t *testing.T) {
	srv, mock := newMockRouter(t)
	expectAuth(mock, "m1")
	mock.ExpectBegin().WillReturnError(errors.New("db down"))

	req, err := http.NewRequest(http.MethodPatch, srv.URL+"/api/tasks/t1", strings.NewReader(`{"title":"Updated"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer mock-key")
	req.Header.Set("Content-Type", "application/json")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("task update database error should return 500, got %d", res.StatusCode)
	}
}
