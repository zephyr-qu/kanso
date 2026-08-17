// 仪表盘与备份测试：聚合统计、需要关注、趋势、全量快照。
package service

import (
	"context"
	"errors"
	"testing"

	"kanso/internal/db/gen"
)

func TestGetDashboard(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, _, cols := setupBoard(t, env)

	// 3 个任务：1 个 urgent、1 个带截止日期、1 个在末列（已完成）。
	urgent, _, err := env.svc.CreateTask(ctx, cols[0], "紧急任务", "", "urgent", nil, nil)
	requireNoErr(t, err)
	_, _, err = env.svc.CreateTask(ctx, cols[0], "到期任务", "", "med", ptr("2026-08-20"), nil)
	requireNoErr(t, err)
	_, _, err = env.svc.CreateTask(ctx, cols[3], "已完成任务", "", "low", nil, nil)
	requireNoErr(t, err)

	data, err := env.svc.GetDashboard(ctx)
	requireNoErr(t, err)

	if data.TotalTasks != 3 {
		t.Fatalf("TotalTasks 应为 3，实际 %d", data.TotalTasks)
	}
	if data.Urgent != 1 {
		t.Fatalf("Urgent 应为 1，实际 %d", data.Urgent)
	}
	if data.DoneTasks != 1 {
		t.Fatalf("DoneTasks（末列）应为 1，实际 %d", data.DoneTasks)
	}
	if data.CompletionPercent != 33 {
		t.Fatalf("CompletionPercent 应为 33，实际 %d", data.CompletionPercent)
	}
	// 分布：按列（有数据列）+ 按优先级（urgent/med/low）。
	if len(data.ByColumn) == 0 {
		t.Fatal("ByColumn 不应为空")
	}
	if len(data.ByPriority) != 3 {
		t.Fatalf("ByPriority 应为 3 档，实际 %d", len(data.ByPriority))
	}
	// 项目统计。
	if len(data.Projects) != 1 || data.Projects[0].Total != 3 || data.Projects[0].Done != 1 {
		t.Fatalf("Projects 统计不符: %+v", data.Projects)
	}
	// 需要关注：urgent + 到期任务（2 条），末列任务不在内。
	if len(data.Focus) != 2 {
		t.Fatalf("Focus 应为 2 条（urgent+到期），实际 %d", len(data.Focus))
	}
	for _, f := range data.Focus {
		if f.ID == "" {
			t.Fatal("Focus 条目缺 ID")
		}
	}
	// 趋势：本周创建 ≥1。
	if len(data.Trend) == 0 {
		t.Fatal("Trend 不应为空")
	}
	var createdToday int64
	for _, p := range data.Trend {
		createdToday += p.Created
	}
	if createdToday == 0 {
		t.Fatal("趋势应有今日创建")
	}
	// 最近活动：创建任务的活动 ≥3 条。
	if len(data.RecentActivity) < 3 {
		t.Fatalf("RecentActivity 应 ≥3，实际 %d", len(data.RecentActivity))
	}
	// 统计卡：NewThisWeek。
	if data.NewThisWeek != 3 {
		t.Fatalf("NewThisWeek 应为 3，实际 %d", data.NewThisWeek)
	}
	_ = urgent
}

func TestGetBackup(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID, projectID, cols := setupBoard(t, env)

	// 造数据：任务 + 标签 + 评论 + 里程碑关联。
	task, _, err := env.svc.CreateTask(ctx, cols[0], "备份任务", "描述", "med", nil, nil)
	requireNoErr(t, err)
	label, err := env.svc.CreateLabel(ctx, projectID, "备份标签")
	requireNoErr(t, err)
	requireNoErr(t, env.svc.AttachLabel(ctx, task.ID, label.ID))
	_, err = env.svc.CreateComment(ctx, task.ID, "备份评论")
	requireNoErr(t, err)
	ms, err := env.svc.CreateMilestone(ctx, projectID, "备份里程碑", nil)
	requireNoErr(t, err)
	requireNoErr(t, env.svc.SetTaskMilestone(ctx, task.ID, ms.ID, true))

	backup, err := env.svc.GetBackup(ctx)
	requireNoErr(t, err)

	if backup.ExportedAt == "" {
		t.Fatal("导出时间不应为空")
	}
	if len(backup.Workspaces) != 1 {
		t.Fatalf("备份工作区应 1 个，实际 %d", len(backup.Workspaces))
	}
	if len(backup.Projects) != 1 {
		t.Fatalf("备份项目应 1 个，实际 %d", len(backup.Projects))
	}
	if len(backup.Columns) != 4 {
		t.Fatalf("备份列应 4 个，实际 %d", len(backup.Columns))
	}
	if len(backup.Tasks) != 1 {
		t.Fatalf("备份任务应 1 个，实际 %d", len(backup.Tasks))
	}
	if len(backup.Labels) != 1 || len(backup.TaskLabels) != 1 {
		t.Fatalf("备份标签/关联不符: labels=%d taskLabels=%d", len(backup.Labels), len(backup.TaskLabels))
	}
	if len(backup.Milestones) != 1 {
		t.Fatalf("备份里程碑应 1 个，实际 %d", len(backup.Milestones))
	}
	if len(backup.TaskMilestones) != 1 {
		t.Fatalf("备份任务里程碑关联应 1 个，实际 %d", len(backup.TaskMilestones))
	}
	if len(backup.Comments) != 1 {
		t.Fatalf("备份评论应 1 个，实际 %d", len(backup.Comments))
	}
	if len(backup.Activities) == 0 {
		t.Fatal("备份活动不应为空")
	}
	_ = wsID
}

// TestImportBackupRoundtrip 全量替换恢复：导出快照 → 制造新数据 → 导入 → 校验覆盖 + 还原 fidelity。
func TestImportBackupRoundtrip(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID, projectID, cols := setupBoard(t, env)

	task, _, err := env.svc.CreateTask(ctx, cols[0], "快照任务", "描述", "med", nil, nil)
	requireNoErr(t, err)
	label, err := env.svc.CreateLabel(ctx, projectID, "快照标签")
	requireNoErr(t, err)
	requireNoErr(t, env.svc.AttachLabel(ctx, task.ID, label.ID))
	_, err = env.svc.CreateComment(ctx, task.ID, "快照评论")
	requireNoErr(t, err)
	ms, err := env.svc.CreateMilestone(ctx, projectID, "快照里程碑", nil)
	requireNoErr(t, err)
	requireNoErr(t, env.svc.SetTaskMilestone(ctx, task.ID, ms.ID, true))

	backup, err := env.svc.GetBackup(ctx)
	requireNoErr(t, err)
	if len(backup.Tasks) != 1 || len(backup.Milestones) != 1 || len(backup.TaskMilestones) != 1 {
		t.Fatalf("快照应含 1 任务/1 里程碑/1 关联，实际 %d/%d/%d", len(backup.Tasks), len(backup.Milestones), len(backup.TaskMilestones))
	}

	// 制造「当前待覆盖」的新数据。
	project2, err := env.svc.CreateProject(ctx, wsID, "覆盖项目", "board")
	requireNoErr(t, err)

	// 导入（全量替换）。
	requireNoErr(t, env.svc.ImportBackup(ctx, backup))

	// 覆盖项目应被移除。
	if _, err := env.svc.GetBoard(ctx, project2.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("导入后覆盖项目应不存在，实际 %v", err)
	}

	// 原项目列/任务/标签/评论应完整还原。
	board, err := env.svc.GetBoard(ctx, projectID)
	requireNoErr(t, err)
	if len(board.Columns) != 4 {
		t.Fatalf("还原列应 4 个，实际 %d", len(board.Columns))
	}
	taskCount := 0
	for _, c := range board.Columns {
		taskCount += len(c.Tasks)
	}
	if taskCount != 1 {
		t.Fatalf("还原任务应 1 个，实际 %d", taskCount)
	}
	detail, err := env.svc.GetTaskDetail(ctx, task.ID)
	requireNoErr(t, err)
	if len(detail.Labels) != 1 || detail.Labels[0].Name != "快照标签" {
		t.Fatalf("还原标签不符: %+v", detail.Labels)
	}
	if len(detail.Comments) != 1 {
		t.Fatalf("还原评论不符: %d", len(detail.Comments))
	}

	// 里程碑经再次导出校验（TaskDetail 不带 milestones）。
	restored, err := env.svc.GetBackup(ctx)
	requireNoErr(t, err)
	if len(restored.Milestones) != 1 || restored.Milestones[0].Name != "快照里程碑" {
		t.Fatalf("还原里程碑不符: %+v", restored.Milestones)
	}
	if len(restored.TaskMilestones) != 1 {
		t.Fatalf("还原任务里程碑关联应 1 个，实际 %d", len(restored.TaskMilestones))
	}
}

// TestImportBackupPreservesMembers 导入不应清掉成员：访问密钥属认证态，不随快照迁移。
// 同时校验快照工作区 ID 变化（跨实例迁移）时成员被重挂到首个恢复的工作区，并广播 backup.imported。
func TestImportBackupPreservesMembers(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	oldWSID, _, _ := setupBoard(t, env)

	if !env.svc.VerifyKey(ctx, "test-key") {
		t.Fatal("种子 owner 密钥应有效")
	}

	// 手工快照：仅一个 ID 与当前工作区不同的新工作区，模拟迁移备份。
	backup := BackupData{
		ExportedAt: "2026-08-17T00:00:00Z",
		Workspaces: []gen.Workspace{{ID: "ws-new", Name: "导入工作区", CreatedAt: "2026-08-17T00:00:00Z"}},
	}
	requireNoErr(t, env.svc.ImportBackup(ctx, backup))

	// 旧工作区被替换；成员密钥仍有效（未随快照清空）。
	if !env.svc.VerifyKey(ctx, "test-key") {
		t.Fatal("导入后成员密钥应仍有效（成员不随快照迁移）")
	}
	ws, err := env.svc.ListWorkspaces(ctx)
	requireNoErr(t, err)
	if len(ws) != 1 || ws[0].ID != "ws-new" {
		t.Fatalf("工作区应被替换为 ws-new，实际 %+v", ws)
	}
	if ws[0].ID == oldWSID {
		t.Fatal("工作区 ID 应已变化")
	}
	// 成员重挂到首个恢复的工作区。
	members, err := env.svc.ListMembers(ctx, "ws-new")
	requireNoErr(t, err)
	if len(members) != 1 {
		t.Fatalf("恢复工作区下成员应 1 个，实际 %d", len(members))
	}
	// 导入是全局变更，应广播工作区级事件。
	if !env.hub.hasType(EventBackupImported) {
		t.Fatalf("导入后应广播 backup.imported，实际 %v", env.hub.types())
	}
}
