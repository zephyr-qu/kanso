// Package service 测试：真实 SQLite + 种子数据，直接调用领域服务（公共 seam）。
// 覆盖全生命周期与错误路径；广播副作用用 fakeBroadcaster 断言。
package service

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"

	"kanso/internal/config"
	"kanso/internal/db"
	"kanso/internal/realtime"
)

// fakeBroadcaster 记录广播事件，验证写操作副作用。
type fakeBroadcaster struct {
	mu     sync.Mutex
	events []realtime.Event
}

func (f *fakeBroadcaster) Broadcast(projectID string, e realtime.Event) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, e)
}

func (f *fakeBroadcaster) BroadcastAll(e realtime.Event) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, e)
}

func (f *fakeBroadcaster) types() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, 0, len(f.events))
	for _, e := range f.events {
		out = append(out, e.Type)
	}
	return out
}

func (f *fakeBroadcaster) hasType(t string) bool {
	for _, got := range f.types() {
		if got == t {
			return true
		}
	}
	return false
}

// testService 是真实 SQLite + 种子 + broadcaster 的测试环境。
type testService struct {
	svc *Service
	db  *sql.DB
	hub *fakeBroadcaster
}

func newTestService(t *testing.T) *testService {
	t.Helper()
	return newTestServiceMode(t, config.ModeTeam)
}

func newTestServiceMode(t *testing.T, mode config.Mode) *testService {
	t.Helper()
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	svc := New(database, mode)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatalf("种子默认工作区失败: %v", err)
	}
	if err := svc.SeedOwnerMember(context.Background(), "test-key"); err != nil {
		t.Fatalf("种子 owner 失败: %v", err)
	}
	hub := &fakeBroadcaster{}
	svc.SetBroadcaster(hub)
	return &testService{svc: svc, db: database, hub: hub}
}

// requireNoErr 断言无错误。
func requireNoErr(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
}

func TestSeedDefaultWorkspace(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	// 已有工作区时幂等（再次种子不重复创建）。
	requireNoErr(t, env.svc.SeedDefaultWorkspace(ctx))
	ws, err := env.svc.ListWorkspaces(ctx)
	requireNoErr(t, err)
	if len(ws) != 1 {
		t.Fatalf("默认工作区应恰有 1 个，实际 %d", len(ws))
	}
	if ws[0].Name != "默认工作区" {
		t.Fatalf("默认工作区名不符: %q", ws[0].Name)
	}
}

func TestWorkspaceLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()

	// 创建。
	created, err := env.svc.CreateWorkspace(ctx, "第二工作区")
	requireNoErr(t, err)
	if created.Name != "第二工作区" {
		t.Fatalf("创建工作区名不符: %q", created.Name)
	}

	// 重命名。
	renamed, err := env.svc.RenameWorkspace(ctx, created.ID, "改名后")
	requireNoErr(t, err)
	if renamed.Name != "改名后" {
		t.Fatalf("重命名失败: %q", renamed.Name)
	}

	// 重命名不存在 → ErrNotFound。
	if _, err := env.svc.RenameWorkspace(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("重命名不存在应 ErrNotFound，实际 %v", err)
	}

	// 删除最后一个工作区 → ErrLastWorkspace。
	if err := env.svc.DeleteWorkspace(ctx, created.ID); err != nil {
		t.Fatalf("删除第二个工作区失败: %v", err)
	}
	remaining, err := env.svc.ListWorkspaces(ctx)
	requireNoErr(t, err)
	if len(remaining) != 1 {
		t.Fatalf("删除后应剩 1 个工作区，实际 %d", len(remaining))
	}
	if err := env.svc.DeleteWorkspace(ctx, remaining[0].ID); !errors.Is(err, ErrLastWorkspace) {
		t.Fatalf("删除最后一个应 ErrLastWorkspace，实际 %v", err)
	}

	// 删除不存在 → ErrNotFound。
	if err := env.svc.DeleteWorkspace(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在应 ErrNotFound，实际 %v", err)
	}
}

func TestProjectLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)

	// 创建 board 模板项目 → 4 默认列。
	project, err := env.svc.CreateProject(ctx, wsID, "看板项目")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)
	if len(board.Columns) != 4 {
		t.Fatalf("board 项目应种子 4 列，实际 %d", len(board.Columns))
	}
	if board.Columns[0].Name != "待办" || board.Columns[3].Name != "已完成" {
		t.Fatalf("默认列顺序不符: %v", board.Columns)
	}

	// 重命名。
	renamed, err := env.svc.RenameProject(ctx, project.ID, "改名项目")
	requireNoErr(t, err)
	if renamed.Name != "改名项目" {
		t.Fatalf("重命名项目失败: %q", renamed.Name)
	}
	if _, err := env.svc.RenameProject(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("重命名不存在项目应 ErrNotFound，实际 %v", err)
	}

	// 列表统计。
	summaries, err := env.svc.ListProjects(ctx, wsID)
	requireNoErr(t, err)
	if len(summaries) != 1 {
		t.Fatalf("应有 1 个项目，实际 %d", len(summaries))
	}
	if summaries[0].ColumnCount != 4 || summaries[0].TaskCount != 0 {
		t.Fatalf("项目统计不符: %+v", summaries[0])
	}

	// 删除 + 不存在。
	requireNoErr(t, env.svc.DeleteProject(ctx, project.ID))
	if err := env.svc.DeleteProject(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在项目应 ErrNotFound，实际 %v", err)
	}
}

func TestSearchTasks(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)
	project, err := env.svc.CreateProject(ctx, wsID, "搜索项目")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)
	colID := board.Columns[0].ID

	_, _, err = env.svc.CreateTask(ctx, colID, "设计原型图", "", "med", nil, nil)
	requireNoErr(t, err)
	_, _, err = env.svc.CreateTask(ctx, colID, "后端接口", "Fix the API endpoint", "high", nil, nil)
	requireNoErr(t, err)

	// 标题匹配。
	results, err := env.svc.SearchTasks(ctx, "原型")
	requireNoErr(t, err)
	if len(results) != 1 || results[0].Title != "设计原型图" {
		t.Fatalf("按标题搜索不符: %+v", results)
	}
	// 描述匹配（大小写不敏感）。
	results, err = env.svc.SearchTasks(ctx, "DATABASE")
	// 描述匹配（大小写不敏感）：搜索 "api" 命中 "Fix the API endpoint"。
	results, err = env.svc.SearchTasks(ctx, "api")
	if len(results) != 1 {
		t.Fatalf("按描述搜索应命中 1 条，实际 %d", len(results))
	}
	// 空查询返回全部。
	results, err = env.svc.SearchTasks(ctx, "")
	requireNoErr(t, err)
	if len(results) != 2 {
		t.Fatalf("空查询应返回全部 2 条，实际 %d", len(results))
	}
}

func TestGetActivities(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)
	project, err := env.svc.CreateProject(ctx, wsID, "活动项目")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)

	_, _, err = env.svc.CreateTask(ctx, board.Columns[0].ID, "任务甲", "", "med", nil, nil)
	requireNoErr(t, err)
	_, _, err = env.svc.CreateTask(ctx, board.Columns[0].ID, "任务乙", "", "med", nil, nil)
	requireNoErr(t, err)

	activities, err := env.svc.GetActivities(ctx)
	requireNoErr(t, err)
	if len(activities) < 2 {
		t.Fatalf("应有至少 2 条活动，实际 %d", len(activities))
	}
	if activities[0].ProjectName != "活动项目" {
		t.Fatalf("活动应带项目名: %+v", activities[0])
	}
	// 广播了任务创建事件。
	if !env.hub.hasType(EventTaskCreated) {
		t.Fatalf("应广播 task.created，实际 %v", env.hub.types())
	}
}

// defaultWorkspaceID 返回种子工作区 ID。
func defaultWorkspaceID(t *testing.T, env *testService) string {
	t.Helper()
	ws, err := env.svc.ListWorkspaces(context.Background())
	requireNoErr(t, err)
	if len(ws) != 1 {
		t.Fatalf("应有 1 个工作区，实际 %d", len(ws))
	}
	return ws[0].ID
}
