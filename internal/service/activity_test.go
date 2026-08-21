package service

import (
	"context"
	"testing"
)

// TestActivityCoverage guards the global activity stream against the old
// task-only regression: domain writes that already emit events must also leave
// a durable activity row with its project/workspace scope.
func TestActivityCoverage(t *testing.T) {
	env := newTestService(t)
	ctx := context.Background()
	workspaceID := defaultWorkspaceID(t, env)
	project, err := env.svc.CreateProject(ctx, workspaceID, "活动覆盖项目")
	requireNoErr(t, err)
	board, err := env.svc.GetBoard(ctx, project.ID)
	requireNoErr(t, err)

	column, err := env.svc.CreateColumn(ctx, project.ID, "活动列", nil)
	requireNoErr(t, err)
	_, err = env.svc.RenameColumn(ctx, column.ID, "活动列改名")
	requireNoErr(t, err)
	_, err = env.svc.MoveColumn(ctx, column.ID, 0)
	requireNoErr(t, err)

	label, err := env.svc.CreateLabel(ctx, project.ID, "活动标签")
	requireNoErr(t, err)
	_, err = env.svc.UpdateLabel(ctx, label.ID, ptr("活动标签改名"))
	requireNoErr(t, err)

	milestone, err := env.svc.CreateMilestone(ctx, project.ID, "活动里程碑", nil)
	requireNoErr(t, err)
	_, err = env.svc.UpdateMilestone(ctx, milestone.ID, ptr("活动里程碑改名"), nil)
	requireNoErr(t, err)

	member, err := env.svc.CreateMember(ctx, workspaceID, "活动成员")
	requireNoErr(t, err)
	_, err = env.svc.UpdateMemberProfile(ctx, member.ID, ptr("活动成员改名"), nil, nil)
	requireNoErr(t, err)
	requireNoErr(t, env.svc.DeleteMember(ctx, member.ID))

	task, _, err := env.svc.CreateTask(ctx, board.Columns[0].ID, "将被删除的任务", "", "", nil, nil)
	requireNoErr(t, err)
	requireNoErr(t, env.svc.DeleteTask(ctx, task.ID))

	activities, err := env.svc.GetActivities(ctx)
	requireNoErr(t, err)
	want := map[string]bool{
		EventColumnCreated: false, EventColumnUpdated: false, EventColumnMoved: false,
		EventLabelCreated: false, EventLabelUpdated: false,
		EventMilestoneCreated: false, EventMilestoneUpdated: false,
		EventMemberCreated: false, EventMemberUpdated: false, EventMemberDeleted: false,
		EventTaskDeleted: false,
	}
	for _, item := range activities {
		if _, ok := want[item.Action]; ok {
			want[item.Action] = true
			if item.ProjectName == "" {
				t.Fatalf("活动 %s 缺少项目/工作区范围: %+v", item.Action, item)
			}
		}
	}
	for action, found := range want {
		if !found {
			t.Errorf("活动流缺少 %s", action)
		}
	}
}
