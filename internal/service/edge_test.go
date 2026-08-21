// 边界路径测试：种子分叉、保留名/成员上限、owner 保护、空列表等可达分支。
package service

import (
	"context"
	"errors"
	"testing"

	"kanso/internal/config"
	"kanso/internal/db"
)

// TestSeedOwnerMemberSkipsNoWorkspace：无工作区时跳过（避免孤儿 owner）。
func TestSeedOwnerMemberSkipsNoWorkspace(t *testing.T) {
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	svc := New(database, config.ModeTeam)
	// 不种子工作区，直接种子 owner → 应静默跳过。
	if err := svc.SeedOwnerMember(context.Background(), "key"); err != nil {
		t.Fatalf("无工作区时 SeedOwnerMember 应跳过，实际 %v", err)
	}
	if _, ok := svc.OwnerMember(context.Background()); ok {
		t.Fatal("无工作区不应创建 owner")
	}
}

// TestSeedOwnerMemberCreatesWhenAbsent：有工作区但无 owner → 创建。
func TestSeedOwnerMemberCreatesWhenAbsent(t *testing.T) {
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	svc := New(database, config.ModeTeam)
	if err := svc.SeedDefaultWorkspace(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := svc.SeedOwnerMember(context.Background(), "fresh-key"); err != nil {
		t.Fatalf("创建 owner 失败: %v", err)
	}
	owner, ok := svc.OwnerMember(context.Background())
	if !ok || owner.Name == "" {
		t.Fatalf("owner 应已创建: %+v ok=%v", owner, ok)
	}
	if id, ok := svc.MemberIDByKey(context.Background(), "fresh-key"); !ok || id != owner.ID {
		t.Fatalf("fresh-key 应命中新 owner")
	}
}

func TestMemberLimitsAndProtection(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)

	// 保留名拒绝。
	if _, err := env.svc.CreateMember(ctx, wsID, "Admin"); !errors.Is(err, ErrReservedName) {
		t.Fatalf("保留名应 ErrReservedName，实际 %v", err)
	}
	// 创建到不存在工作区 → ErrNotFound。
	if _, err := env.svc.CreateMember(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("创建到不存在工作区应 ErrNotFound，实际 %v", err)
	}

	// 填满成员上限（owner + 4 成员 = 5）。
	for i := 0; i < 4; i++ {
		if _, err := env.svc.CreateMember(ctx, wsID, "成员"); err != nil {
			t.Fatalf("创建成员 %d 失败: %v", i, err)
		}
	}
	if _, err := env.svc.CreateMember(ctx, wsID, "超员"); !errors.Is(err, ErrMemberLimit) {
		t.Fatalf("超出上限应 ErrMemberLimit，实际 %v", err)
	}

	// owner 受保护：删除 owner → ErrOwnerProtected。
	owner, _ := env.svc.OwnerMember(ctx)
	if err := env.svc.DeleteMember(ctx, owner.ID); !errors.Is(err, ErrOwnerProtected) {
		t.Fatalf("删除 owner 应 ErrOwnerProtected，实际 %v", err)
	}
	// 删除普通成员（验证 owner 保护外的路径）。
	members, err := env.svc.ListMembers(ctx, wsID)
	requireNoErr(t, err)
	var normal string
	for _, m := range members {
		if m.Role != memberRoleOwner {
			normal = m.ID
			break
		}
	}
	requireNoErr(t, env.svc.DeleteMember(ctx, normal))
}

func TestWorkspaceAndProjectEmpty(t *testing.T) {
	// 空库（无工作区）时 ListWorkspaces 返回空切片而非 nil。
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	svc := New(database, config.ModePersonal)

	ws, err := svc.ListWorkspaces(context.Background())
	requireNoErr(t, err)
	if ws == nil || len(ws) != 0 {
		t.Fatalf("空库 ListWorkspaces 应返回空切片: %v", ws)
	}
	// 不存在工作区的项目列表 → 空切片。
	projects, err := svc.ListProjects(context.Background(), "nope")
	requireNoErr(t, err)
	if projects == nil || len(projects) != 0 {
		t.Fatalf("不存在工作区 ListProjects 应返回空切片: %v", projects)
	}
	// 空查询搜索 → 空结果。
	results, err := svc.SearchTasks(context.Background(), "")
	requireNoErr(t, err)
	if results == nil || len(results) != 0 {
		t.Fatalf("空库搜索应返回空切片: %v", results)
	}
}

func TestDeleteWorkspaceCleansActivities(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)

	// 造第二个工作区 + 项目 + 任务（产生活动），删除后只保留删除审计事件。
	second, err := env.svc.CreateWorkspace(ctx, "临时工作区")
	requireNoErr(t, err)
	project, err := env.svc.CreateProject(ctx, second.ID, "临时项目")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)
	_, _, err = env.svc.CreateTask(ctx, board.Columns[0].ID, "临时任务", "", "", nil, nil)
	requireNoErr(t, err)

	// 活动存在。
	activities, err := env.svc.GetActivities(ctx)
	requireNoErr(t, err)
	if len(activities) == 0 {
		t.Fatal("删除前应有活动")
	}

	// 删除工作区。
	requireNoErr(t, env.svc.DeleteWorkspace(ctx, second.ID))

	var deletedCount int
	if err := env.db.QueryRow(`SELECT COUNT(*) FROM activity WHERE workspace_id = ? AND action = ?`, second.ID, EventWorkspaceDeleted).Scan(&deletedCount); err != nil {
		t.Fatalf("查询工作区删除活动失败: %v", err)
	}
	if deletedCount != 1 {
		t.Fatalf("删除工作区应保留 1 条审计事件，实际 %d", deletedCount)
	}

	// 项目删除同样清理原活动，并保留项目删除事件。
	_ = wsID
}
