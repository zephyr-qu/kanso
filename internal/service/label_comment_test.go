// 标签与评论领域测试：CRUD、任务详情聚合、活动记录、错误路径。
package service

import (
	"context"
	"errors"
	"testing"
)

func TestLabelLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, _ := setupBoard(t, env)

	// 创建。
	created, err := env.svc.CreateLabel(ctx, projectID, "设计")
	requireNoErr(t, err)
	if created.Name != "设计" {
		t.Fatalf("标签名不符: %q", created.Name)
	}
	// 创建到不存在项目 → ErrNotFound。
	if _, err := env.svc.CreateLabel(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("创建到不存在项目应 ErrNotFound，实际 %v", err)
	}

	// 更新（改名/空指针保留原名）。
	updated, err := env.svc.UpdateLabel(ctx, created.ID, ptr("前端"))
	requireNoErr(t, err)
	if updated.Name != "前端" {
		t.Fatalf("标签改名失败: %q", updated.Name)
	}
	updated, err = env.svc.UpdateLabel(ctx, created.ID, nil)
	requireNoErr(t, err)
	if updated.Name != "前端" {
		t.Fatalf("空指针应保留原名: %q", updated.Name)
	}
	if _, err := env.svc.UpdateLabel(ctx, "nope", ptr("x")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("更新不存在标签应 ErrNotFound，实际 %v", err)
	}

	// 删除 + 不存在。
	requireNoErr(t, env.svc.DeleteLabel(ctx, created.ID))
	if err := env.svc.DeleteLabel(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在标签应 ErrNotFound，实际 %v", err)
	}
	if !env.hub.hasType(EventLabelCreated) || !env.hub.hasType(EventLabelDeleted) {
		t.Fatalf("标签事件缺失: %v", env.hub.types())
	}
}

func TestCommentLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, _, cols := setupBoard(t, env)

	// 创建带执行者上下文的任务 → 活动/评论归属执行者。
	ctx = WithActor(ctx, "测试员")
	task, _, err := env.svc.CreateTask(ctx, cols[0], "评论任务", "", "", nil, nil)
	requireNoErr(t, err)

	// 创建评论。
	comment, err := env.svc.CreateComment(ctx, task.ID, "第一条评论")
	requireNoErr(t, err)
	if comment.Author != "测试员" {
		t.Fatalf("评论作者应为执行者名，实际 %q", comment.Author)
	}

	// 详情聚合（评论 + 活动归属任务）。
	detail, err := env.svc.GetTaskDetail(ctx, task.ID)
	requireNoErr(t, err)
	if len(detail.Comments) != 1 || detail.Comments[0].Content != "第一条评论" {
		t.Fatalf("详情评论聚合不符: %+v", detail.Comments)
	}
	if len(detail.Activity) < 2 {
		t.Fatalf("详情应有创建+评论活动，实际 %d", len(detail.Activity))
	}
	if detail.ProjectName == "" || detail.ColumnName == "" {
		t.Fatalf("详情应带项目/列名: %+v", detail)
	}

	// 评论到不存在任务 → ErrNotFound。
	if _, err := env.svc.CreateComment(ctx, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("评论到不存在任务应 ErrNotFound，实际 %v", err)
	}

	// 删除评论 + 不存在。
	requireNoErr(t, env.svc.DeleteComment(ctx, comment.ID))
	if err := env.svc.DeleteComment(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在评论应 ErrNotFound，实际 %v", err)
	}
	if !env.hub.hasType(EventCommentCreated) || !env.hub.hasType(EventCommentDeleted) {
		t.Fatalf("评论事件缺失: %v", env.hub.types())
	}
}
