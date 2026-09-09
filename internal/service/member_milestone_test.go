// 成员与里程碑领域测试：成员 CRUD/密钥/权限、里程碑 CRUD/任务关联、错误路径。
package service

import (
	"context"
	"errors"
	"testing"
)

func TestMemberLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	wsID := defaultWorkspaceID(t, env)

	// 初始管理员存在（SeedAdminMember 种了 test-key）。
	owner, ok := env.svc.AdminMember(ctx)
	if !ok || owner.Role != memberRoleAdmin {
		t.Fatalf("管理员成员应存在: %+v ok=%v", owner, ok)
	}

	// 密钥校验：test-key 命中管理员；未知密钥不命中。
	if _, ok := env.svc.MemberIDByKey(ctx, "test-key"); !ok {
		t.Fatal("test-key 应命中")
	}
	if _, ok := env.svc.MemberIDByKey(ctx, "wrong"); ok {
		t.Fatal("未知密钥不应命中")
	}
	if !env.svc.VerifyKey(ctx, "test-key") {
		t.Fatal("VerifyKey(test-key) 应为 true")
	}
	if env.svc.VerifyKey(ctx, "wrong") {
		t.Fatal("VerifyKey(wrong) 应为 false")
	}

	// GetMe / MemberNameByID / RequireInstanceAdmin。
	me, err := env.svc.GetMe(ctx, owner.ID)
	requireNoErr(t, err)
	if name, ok := env.svc.MemberNameByID(ctx, owner.ID); !ok || name != me.Name {
		t.Fatalf("MemberNameByID 不符: %q ok=%v", name, ok)
	}
	if _, ok := env.svc.MemberNameByID(ctx, "nope"); ok {
		t.Fatal("MemberNameByID 不存在应返回 false")
	}
	requireNoErr(t, env.svc.RequireInstanceAdmin(ctx, owner.ID))
	if err := env.svc.RequireInstanceAdmin(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("RequireInstanceAdmin 不存在应 ErrNotFound，实际 %v", err)
	}

	// 创建普通成员（team 模式）→ 非管理员。
	member, err := env.svc.CreateMember(ctx, "普通成员")
	requireNoErr(t, err)
	requireNoErr(t, env.svc.AddMemberToWorkspace(ctx, wsID, member.ID))
	if member.Role == memberRoleAdmin {
		t.Fatal("新成员不应是管理员")
	}
	if err := env.svc.RequireInstanceAdmin(ctx, member.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("非管理员成员 RequireInstanceAdmin 应 ErrForbidden，实际 %v", err)
	}

	// 列表。
	members, err := env.svc.ListMembers(ctx, wsID)
	requireNoErr(t, err)
	if len(members) != 2 {
		t.Fatalf("应有 2 名成员，实际 %d", len(members))
	}

	// 生成密钥 → 立即可用。
	key, err := env.svc.RotateMemberKey(ctx, member.ID)
	requireNoErr(t, err)
	if key == "" {
		t.Fatal("密钥不应为空")
	}
	if _, ok := env.svc.MemberIDByKey(ctx, key); !ok {
		t.Fatal("新密钥应命中")
	}
	// 再次轮换生成新密钥，旧密钥立即失效。
	key2, err := env.svc.RotateMemberKey(ctx, member.ID)
	requireNoErr(t, err)
	if key == key2 {
		t.Fatalf("重复轮换不应复用旧密钥: %q", key)
	}
	if _, ok := env.svc.MemberIDByKey(ctx, key); ok {
		t.Fatal("轮换后旧密钥应失效")
	}
	if _, ok := env.svc.MemberIDByKey(ctx, key2); !ok {
		t.Fatal("轮换后新密钥应命中")
	}
	var storedHash string
	if err := env.db.QueryRow("SELECT access_key_hash FROM member WHERE id = ?", member.ID).Scan(&storedHash); err != nil {
		t.Fatalf("读取成员密钥哈希失败: %v", err)
	}
	if storedHash != hashAccessKey(key2) || storedHash == key2 {
		t.Fatalf("数据库应只保存密钥哈希，实际 %q", storedHash)
	}
	if err := env.svc.RevokeMemberKey(ctx, member.ID); err != nil {
		t.Fatalf("撤销成员密钥失败: %v", err)
	}
	if _, ok := env.svc.MemberIDByKey(ctx, key2); ok {
		t.Fatal("撤销后成员密钥应失效")
	}
	members, err = env.svc.ListMembers(ctx, wsID)
	requireNoErr(t, err)
	for _, item := range members {
		if item.ID == member.ID && item.HasKey {
			t.Fatal("撤销后成员记录应保留但 hasKey=false")
		}
	}

	// 角色提升在一个事务内完成，允许保留多名管理员。
	target, err := env.svc.CreateMember(ctx, "新成员")
	requireNoErr(t, err)
	updatedRole, err := env.svc.UpdateMemberRole(ctx, target.ID, memberRoleAdmin)
	requireNoErr(t, err)
	if updatedRole.Role != memberRoleAdmin {
		t.Fatalf("目标应成为管理员: %+v", updatedRole)
	}

	// 更新资料（改名 + 头像色 + 头像）。
	avatar := "data:image/png;base64,xxx"
	updated, err := env.svc.UpdateMemberProfile(ctx, member.ID, ptr("新名字"), ptr("#ff0000"), ptr(ptr(avatar)))
	requireNoErr(t, err)
	if updated.Name != "新名字" || updated.AvatarColor == nil || updated.Avatar == nil {
		t.Fatalf("资料更新不符: %+v", updated)
	}
	if _, err := env.svc.UpdateMemberProfile(ctx, "nope", ptr("x"), nil, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("更新不存在成员应 ErrNotFound，实际 %v", err)
	}

	// 删除成员 + 不存在。
	requireNoErr(t, env.svc.DeleteMember(ctx, member.ID))
	if err := env.svc.DeleteMember(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在成员应 ErrNotFound，实际 %v", err)
	}
	if !env.hub.hasType(EventMemberCreated) || !env.hub.hasType(EventMemberDeleted) {
		t.Fatalf("成员事件缺失: %v", env.hub.types())
	}
	if !env.hub.hasType(EventMemberKeyRotated) || !env.hub.hasType(EventMemberKeyRevoked) {
		t.Fatalf("成员安全事件缺失: %v", env.hub.types())
	}
}

func TestMemberProfileKeepsActivityActor(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, cols := setupBoard(t, env)

	// 造一条 Admin 归属的活动（创建任务默认 actor 回退 Admin）。
	_, _, err := env.svc.CreateTask(ctx, cols[0], "历史任务", "", "", nil, nil)
	requireNoErr(t, err)

	// 把管理员改名后，身份资料与活动记录保持可用。
	owner, _ := env.svc.AdminMember(ctx)
	if _, err := env.svc.UpdateMemberProfile(ctx, owner.ID, ptr("新主人"), nil, nil); err != nil {
		t.Fatal(err)
	}
	activities, err := env.svc.GetActivities(ctx, defaultWorkspaceID(t, env))
	requireNoErr(t, err)
	if len(activities) == 0 {
		t.Fatal("应保留活动记录")
	}
	_ = projectID
}

func TestMilestoneLifecycle(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	_, projectID, cols := setupBoard(t, env)

	// 创建里程碑（带截止日期 + 空截止日期归一）。
	milestone, err := env.svc.CreateMilestone(ctx, projectID, "里程碑一", ptr("2026-09-01"))
	requireNoErr(t, err)
	if milestone.Name != "里程碑一" || milestone.DueDate == nil {
		t.Fatalf("创建里程碑不符: %+v", milestone)
	}
	_, err = env.svc.CreateMilestone(ctx, projectID, "里程碑二", nil)
	requireNoErr(t, err)
	if _, err := env.svc.CreateMilestone(ctx, "nope", "x", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("创建到不存在项目应 ErrNotFound，实际 %v", err)
	}

	// 列表。
	milestones, err := env.svc.ListMilestones(ctx, projectID)
	requireNoErr(t, err)
	if len(milestones) != 2 {
		t.Fatalf("应有 2 个里程碑，实际 %d", len(milestones))
	}

	// 更新（改名 + 清空截止日期 + 空指针保留）。
	updated, err := env.svc.UpdateMilestone(ctx, milestone.ID, ptr("里程碑一改名"), ptr(""))
	requireNoErr(t, err)
	if updated.Name != "里程碑一改名" || updated.DueDate != nil {
		t.Fatalf("更新里程碑不符: %+v", updated)
	}
	updated, err = env.svc.UpdateMilestone(ctx, milestone.ID, nil, nil)
	requireNoErr(t, err)
	if updated.Name != "里程碑一改名" {
		t.Fatalf("空指针应保留: %+v", updated)
	}
	if _, err := env.svc.UpdateMilestone(ctx, "nope", ptr("x"), nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("更新不存在里程碑应 ErrNotFound，实际 %v", err)
	}

	// 关联任务。
	task, _, err := env.svc.CreateTask(ctx, cols[0], "里程碑任务", "", "", nil, nil)
	requireNoErr(t, err)
	requireNoErr(t, env.svc.SetTaskMilestone(ctx, task.ID, milestone.ID, true))
	if !env.hub.hasType(EventMilestoneAttached) {
		t.Fatalf("应广播 milestone.attached: %v", env.hub.types())
	}
	// 重复关联幂等。
	requireNoErr(t, env.svc.SetTaskMilestone(ctx, task.ID, milestone.ID, true))
	// 解关联。
	requireNoErr(t, env.svc.SetTaskMilestone(ctx, task.ID, milestone.ID, false))
	if !env.hub.hasType(EventMilestoneDetached) {
		t.Fatalf("应广播 milestone.detached: %v", env.hub.types())
	}
	// 错误路径：任务/里程碑不存在、跨项目。
	if err := env.svc.SetTaskMilestone(ctx, "nope", milestone.ID, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("任务不存在应 ErrNotFound，实际 %v", err)
	}
	if err := env.svc.SetTaskMilestone(ctx, task.ID, "nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("里程碑不存在应 ErrNotFound，实际 %v", err)
	}
	other, err := env.svc.CreateProject(ctx, defaultWorkspaceID(t, env), "另一项目")
	requireNoErr(t, err)
	otherMs, err := env.svc.CreateMilestone(ctx, other.ID, "外部里程碑", nil)
	requireNoErr(t, err)
	if err := env.svc.SetTaskMilestone(ctx, task.ID, otherMs.ID, true); !errors.Is(err, ErrCrossProjectMove) {
		t.Fatalf("跨项目关联应 ErrCrossProjectMove，实际 %v", err)
	}

	// 删除里程碑 + 不存在。
	requireNoErr(t, env.svc.DeleteMilestone(ctx, milestone.ID))
	if err := env.svc.DeleteMilestone(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("删除不存在里程碑应 ErrNotFound，实际 %v", err)
	}
	if !env.hub.hasType(EventMilestoneCreated) || !env.hub.hasType(EventMilestoneDeleted) {
		t.Fatalf("里程碑事件缺失: %v", env.hub.types())
	}
}
