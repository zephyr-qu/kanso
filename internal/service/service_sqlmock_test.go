// service 层 DB 错误分支测试（sqlmock）：聚合/写操作在数据库故障时正确返回错误。
// 正常路径由真实 SQLite 测试覆盖；此处用 sqlmock 注入 *sql.DB 触发防御分支。
package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"kanso/internal/config"
)

// newMockService 创建注入 sqlmock 的 Service。
func newMockService(t *testing.T) (sqlmock.Sqlmock, *Service) {
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
	return mock, New(db, config.ModeTeam)
}

func TestGetDashboardQueryError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("ListColumnDistributions").
		WillReturnError(errors.New("列分布查询失败"))
	if _, err := svc.GetDashboard(context.Background()); err == nil {
		t.Fatal("列分布查询失败时应返回错误")
	}
}

func TestGetActivitiesQueryError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("ListActivitiesWithProject").
		WillReturnError(errors.New("活动查询失败"))
	if _, err := svc.GetActivities(context.Background()); err == nil {
		t.Fatal("活动查询失败时应返回错误")
	}
}

func TestSearchTasksQueryError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("SearchTasks").
		WillReturnError(errors.New("搜索失败"))
	if _, err := svc.SearchTasks(context.Background(), "q"); err == nil {
		t.Fatal("搜索失败时应返回错误")
	}
}

func TestListProjectsQueryError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("ListProjectsByWorkspace").
		WillReturnError(errors.New("项目查询失败"))
	if _, err := svc.ListProjects(context.Background(), "w1"); err == nil {
		t.Fatal("项目查询失败时应返回错误")
	}
}

func TestListProjectsStatsError(t *testing.T) {
	mock, svc := newMockService(t)
	// 项目列表成功 → 统计聚合失败。
	mock.ExpectQuery("ListProjectsByWorkspace").
		WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
			AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
	mock.ExpectQuery("p.id AS project_id").
		WillReturnError(errors.New("统计查询失败"))
	if _, err := svc.ListProjects(context.Background(), "w1"); err == nil {
		t.Fatal("统计查询失败时应返回错误")
	}
}

func TestGetBoardColumnsError(t *testing.T) {
	mock, svc := newMockService(t)
	// 项目存在，列查询失败。
	mock.ExpectQuery("FROM project WHERE id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "workspace_id", "name", "position", "created_at", "updated_at"}).
			AddRow("p1", "w1", "项目", 0, "2026-01-01", "2026-01-01"))
	mock.ExpectQuery("ListColumnsByProject").
		WillReturnError(errors.New("列查询失败"))
	if _, err := svc.GetBoard(context.Background(), "p1"); err == nil {
		t.Fatal("列查询失败时应返回错误")
	}
}

func TestGetBackupBeginError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))
	if _, err := svc.GetBackup(context.Background()); err == nil {
		t.Fatal("BeginTx 失败时应返回错误")
	}
}

func TestGetBackupListError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin()
	mock.ExpectQuery("ListWorkspaces").
		WillReturnError(errors.New("导出工作区失败"))
	mock.ExpectRollback()
	if _, err := svc.GetBackup(context.Background()); err == nil {
		t.Fatal("导出工作区失败时应返回错误")
	}
}

func TestCreateTaskBeginError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))
	if _, _, err := svc.CreateTask(context.Background(), "c1", "任务", "", "", nil, nil); err == nil {
		t.Fatal("BeginTx 失败时应返回错误")
	}
}

func TestCreateColumnGetProjectError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("FROM project WHERE id").
		WillReturnError(sql.ErrNoRows)
	if _, err := svc.CreateColumn(context.Background(), "nope", "列", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("项目不存在应 ErrNotFound，实际 %v", err)
	}
}

func TestDeleteColumnGetError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM column WHERE id").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()
	if err := svc.DeleteColumn(context.Background(), "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("列不存在应 ErrNotFound，实际 %v", err)
	}
}

func TestMoveColumnBeginError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))
	if _, err := svc.MoveColumn(context.Background(), "c1", 0); err == nil {
		t.Fatal("BeginTx 失败时应返回错误")
	}
}

func TestCreateProjectBeginError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))
	if _, err := svc.CreateProject(context.Background(), "w1", "项目"); err == nil {
		t.Fatal("BeginTx 失败时应返回错误")
	}
}

func TestCreateLabelGetProjectError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM project WHERE id").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()
	if _, err := svc.CreateLabel(context.Background(), "nope", "标签"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("项目不存在应 ErrNotFound，实际 %v", err)
	}
}

func TestGetTaskDetailTaskError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectQuery("FROM task WHERE id").
		WillReturnError(sql.ErrNoRows)
	if _, err := svc.GetTaskDetail(context.Background(), "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("任务不存在应 ErrNotFound，实际 %v", err)
	}
}

func TestCreateCommentBeginError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))
	if _, err := svc.CreateComment(context.Background(), "t1", "评论"); err == nil {
		t.Fatal("BeginTx 失败时应返回错误")
	}
}

func TestCreateMilestoneGetProjectError(t *testing.T) {
	mock, svc := newMockService(t)
	mock.ExpectBegin()
	mock.ExpectQuery("FROM project WHERE id").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()
	if _, err := svc.CreateMilestone(context.Background(), "nope", "里程碑", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("项目不存在应 ErrNotFound，实际 %v", err)
	}
}
