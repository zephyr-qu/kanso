// 列与任务领域测试：CRUD/移动/归档/标签归属/错误路径/广播。
package service

import (
	"context"
	"errors"
	"testing"
)

// setupBoard 创建项目并返回其列（待办/进行中/已阻塞/已完成）。
func setupBoard(t *testing.T, env *testService) (wsID, projectID string, cols []string) {
	t.Helper()
	ctx := context.Background()
	wsID = defaultWorkspaceID(t, env)
	project, err := env.svc.CreateProject(ctx, wsID, "列任务项目", "board")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)
	if len(board.Columns) != 4 {
		t.Fatalf("应种子 4 列，实际 %d", len(board.Columns))
	}
	ids := make([]string, 4)
	for i, c := range board.Columns {
		ids[i] = c.ID
	}
	return wsID, project.ID, ids
}

func TestColumnLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, cols := setupBoard(t, env)

	// 创建列（末尾追加）。
	created, err := env.svc.CreateColumn(ctx, projectID, "新列", nil)
	requireNoErr(t, err)
	if created.Name != "新列" {
		t.Fatalf("列名不符: %q", created.Name)
	}
	board, err := env.svc.GetBoard(ctx, projectID)
	requireNoErr(t, err)
	if len(board.Columns) != 5 {
		t.Fatalf("应 5 列，实际 %d", len(board.Columns))
	}
	if board.Columns[4].Position != 4 {
		t.Fatalf("新列 position 应为 4，实际 %d", board.Columns[4].Position)
	}

	// 创建到不存在项目 → ErrNotFound。
	if _, err := env.svc.CreateColumn(ctx, "nope", "x", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("创建到不存在项目应 ErrNotFound，实际 %v", err)
	}

	// 重命名。
	renamed, err := env.svc.RenameColumn(ctx, created.ID, "改名列")
	requireNoErr(t, err)
	if renamed.Name != "改名列" {
		t.Fatalf("重命名列失败: %q", renamed.Name)
	}
	if _, err := env.svc.RenameColumn(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("重命名不存在列应 ErrNotFound，实际 %v", err)
	}

	// WIP 限制（设置/清空/负数拒绝）。
	updated, err := env.svc.UpdateColumnWIP(ctx, created.ID, ptr(int64(5)))
	requireNoErr(t, err)
	if updated.WipLimit == nil || *updated.WipLimit != 5 {
		t.Fatalf("WIP 设置失败: %+v", updated.WipLimit)
	}
	updated, err = env.svc.UpdateColumnWIP(ctx, created.ID, nil)
	requireNoErr(t, err)
	if updated.WipLimit != nil {
		t.Fatalf("WIP 清空失败: %+v", updated.WipLimit)
	}
	if _, err := env.svc.UpdateColumnWIP(ctx, created.ID, ptr(int64(-1))); err == nil {
		t.Fatal("负 WIP 应报错")
	}
	if _, err := env.svc.UpdateColumnWIP(ctx, "nope", ptr(int64(1))); !errors.Is(err, ErrNotFound) {
		t.Fatalf("WIP 不存在列应 ErrNotFound，实际 %v", err)
	}

	// 移动列到开头。
	moved, err := env.svc.MoveColumn(ctx, created.ID, 0)
	requireNoErr(t, err)
	if moved.Position != 0 {
		t.Fatalf("移动后 position 应为 0，实际 %d", moved.Position)
	}
	board, err = env.svc.GetBoard(ctx, projectID)
	requireNoErr(t, err)
	if board.Columns[0].Name != "改名列" || board.Columns[1].Name != "待办" {
		t.Fatalf("移动后顺序不符: %v", board.Columns)
	}
	// 负数/越界 clamp。
	_, err = env.svc.MoveColumn(ctx, created.ID, -5)
	requireNoErr(t, err)
	_, err = env.svc.MoveColumn(ctx, created.ID, 999)
	requireNoErr(t, err)
	// 移动不存在列 → ErrNotFound。
	if _, err := env.svc.MoveColumn(ctx, "nope", 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("移动不存在列应 ErrNotFound，实际 %v", err)
	}

	// 删除列（含广播）+ 不存在。
	requireNoErr(t, env.svc.DeleteColumn(ctx, created.ID))
	if err := env.svc.DeleteColumn(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在列应 ErrNotFound，实际 %v", err)
	}
	if !env.hub.hasType(EventColumnCreated) || !env.hub.hasType(EventColumnDeleted) {
		t.Fatalf("列事件广播缺失: %v", env.hub.types())
	}
	_ = cols
}

func TestTaskLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, cols := setupBoard(t, env)

	// 创建（默认优先级 med、空描述归一 NULL）。
	task, projectID2, err := env.svc.CreateTask(ctx, cols[0], "任务一", "", "", nil, nil)
	requireNoErr(t, err)
	if task.Priority != "med" {
		t.Fatalf("默认优先级应为 med，实际 %q", task.Priority)
	}
	if task.Description != nil {
		t.Fatalf("空描述应为 NULL，实际 %v", task.Description)
	}
	if projectID2 != projectID {
		t.Fatalf("任务项目 ID 不符")
	}

	// 创建到不存在列 → ErrNotFound。
	if _, _, err := env.svc.CreateTask(ctx, "nope", "x", "", "", nil, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("创建到不存在列应 ErrNotFound，实际 %v", err)
	}

	// 更新（改标题/优先级/清空截止日期）。
	updated, err := env.svc.UpdateTask(ctx, task.ID, ptr("任务一改名"), nil, ptr("high"), ptr(""))
	requireNoErr(t, err)
	if updated.Title != "任务一改名" || updated.Priority != "high" {
		t.Fatalf("更新任务失败: %+v", updated)
	}
	if updated.DueDate != nil {
		t.Fatalf("截止日期应清空，实际 %v", updated.DueDate)
	}
	if _, err := env.svc.UpdateTask(ctx, "nope", ptr("x"), nil, nil, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("更新不存在任务应 ErrNotFound，实际 %v", err)
	}

	// 详情。
	detail, err := env.svc.GetTaskDetail(ctx, task.ID)
	requireNoErr(t, err)
	if detail.Task.Title != "任务一改名" {
		t.Fatalf("详情标题不符: %q", detail.Task.Title)
	}
	if _, err := env.svc.GetTaskDetail(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("详情不存在应 ErrNotFound，实际 %v", err)
	}

	// 移动任务到第二列（同项目）。
	moved, err := env.svc.MoveTask(ctx, task.ID, &cols[1], 0)
	requireNoErr(t, err)
	if moved.ColumnID != cols[1] {
		t.Fatalf("移动后列不符: %q", moved.ColumnID)
	}

	// 归档/恢复 + 归档列表。
	archived, err := env.svc.SetTaskArchived(ctx, task.ID, true)
	requireNoErr(t, err)
	if archived.ArchivedAt == nil {
		t.Fatal("归档应设置 ArchivedAt")
	}
	archivedList, err := env.svc.ListArchivedTasks(ctx, projectID)
	requireNoErr(t, err)
	if len(archivedList) != 1 {
		t.Fatalf("归档列表应 1 条，实际 %d", len(archivedList))
	}
	if _, err := env.svc.ListArchivedTasks(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("归档列表不存在项目应 ErrNotFound，实际 %v", err)
	}
	restored, err := env.svc.SetTaskArchived(ctx, task.ID, false)
	requireNoErr(t, err)
	if restored.ArchivedAt != nil {
		t.Fatal("恢复应清空 ArchivedAt")
	}
	if _, err := env.svc.SetTaskArchived(ctx, "nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("归档不存在任务应 ErrNotFound，实际 %v", err)
	}

	// 删除 + 不存在。
	requireNoErr(t, env.svc.DeleteTask(ctx, task.ID))
	if err := env.svc.DeleteTask(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在任务应 ErrNotFound，实际 %v", err)
	}

	// 广播断言。
	for _, ev := range []string{EventTaskCreated, EventTaskUpdated, EventTaskMoved, EventTaskArchived, EventTaskRestored, EventTaskDeleted} {
		if !env.hub.hasType(ev) {
			t.Fatalf("缺少事件 %s，实际 %v", ev, env.hub.types())
		}
	}
}

func TestTaskLabels(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, cols := setupBoard(t, env)

	// 建两个标签。
	labelA, err := env.svc.CreateLabel(ctx, projectID, "设计")
	requireNoErr(t, err)
	labelB, err := env.svc.CreateLabel(ctx, projectID, "前端")
	requireNoErr(t, err)

	// 创建任务并贴标签（重复 ID 去重）。
	task, _, err := env.svc.CreateTask(ctx, cols[0], "带标签任务", "", "", nil, []string{labelA.ID, labelA.ID, labelB.ID})
	requireNoErr(t, err)

	detail, err := env.svc.GetTaskDetail(ctx, task.ID)
	requireNoErr(t, err)
	if len(detail.Labels) != 2 {
		t.Fatalf("任务应带 2 个标签（去重），实际 %d", len(detail.Labels))
	}

	// 跨项目标签 → ErrCrossProjectMove。
	other, err := env.svc.CreateProject(ctx, defaultWorkspaceID(t, env), "另一项目", "board")
	requireNoErr(t, err)
	otherBoard, err := env.svc.GetBoard(ctx, other.ID)
	requireNoErr(t, err)
	_, err = env.svc.CreateLabel(ctx, other.ID, "外部标签")
	requireNoErr(t, err)
	if _, _, err := env.svc.CreateTask(ctx, otherBoard.Columns[0].ID, "x", "", "", nil, []string{labelA.ID}); !errors.Is(err, ErrCrossProjectMove) {
		t.Fatalf("跨项目贴标签应 ErrCrossProjectMove，实际 %v", err)
	}

	// 不存在的标签 → ErrLabelNotFound。
	if _, _, err := env.svc.CreateTask(ctx, cols[0], "y", "", "", nil, []string{"nope"}); !errors.Is(err, ErrLabelNotFound) {
		t.Fatalf("不存在标签应 ErrLabelNotFound，实际 %v", err)
	}

	// 摘标签。
	requireNoErr(t, env.svc.DetachLabel(ctx, task.ID, labelB.ID))
	// 重复摘 → 幂等（无错误）或行为一致。
	requireNoErr(t, env.svc.DetachLabel(ctx, task.ID, labelB.ID))
	requireNoErr(t, env.svc.AttachLabel(ctx, task.ID, labelB.ID))
	detail, err = env.svc.GetTaskDetail(ctx, task.ID)
	requireNoErr(t, err)
	if len(detail.Labels) != 2 {
		t.Fatalf("重贴后应 2 个标签，实际 %d", len(detail.Labels))
	}
	if !env.hub.hasType(EventLabelAttached) || !env.hub.hasType(EventLabelDetached) {
		t.Fatalf("标签事件缺失: %v", env.hub.types())
	}
}

func TestMoveTaskCrossProject(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)
	projA, err := env.svc.CreateProject(ctx, wsID, "A", "board")
	requireNoErr(t, err)
	projB, err := env.svc.CreateProject(ctx, wsID, "B", "board")
	requireNoErr(t, err)
	boardA, err := env.svc.GetBoard(ctx, projA.ID)
	requireNoErr(t, err)
	boardB, err := env.svc.GetBoard(ctx, projB.ID)
	requireNoErr(t, err)
	task, _, err := env.svc.CreateTask(ctx, boardA.Columns[0].ID, "跨项目任务", "", "", nil, nil)
	requireNoErr(t, err)

	// 移到 B 项目列 → ErrCrossProjectMove。
	if _, err := env.svc.MoveTask(ctx, task.ID, &boardB.Columns[0].ID, 0); !errors.Is(err, ErrCrossProjectMove) {
		t.Fatalf("跨项目移动应 ErrCrossProjectMove，实际 %v", err)
	}
}

func TestMoveTaskNotFound(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, _, cols := setupBoard(t, env)
	if _, err := env.svc.MoveTask(ctx, "nope", &cols[1], 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("移动不存在任务应 ErrNotFound，实际 %v", err)
	}
}

// ptr 返回指针，便于传指针参数。
func ptr[T any](v T) *T { return &v }
