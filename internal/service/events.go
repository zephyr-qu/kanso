package service

import (
	"context"

	"kanso/internal/db/gen"
)

// 事件动作常量（候选 4）：动作字符串只在此处定义，前端 lib/events.ts 与之对齐
// （ADR-0004 无共享类型包——两侧各自枚举，字符串值即合约）。

const (
	EventTaskCreated       = "task.created"
	EventTaskUpdated       = "task.updated"
	EventTaskMoved         = "task.moved"
	EventTaskDeleted       = "task.deleted"
	EventTaskArchived      = "task.archived"
	EventTaskRestored      = "task.restored"
	EventBackupImported    = "backup.imported"
	EventColumnCreated     = "column.created"
	EventColumnUpdated     = "column.updated"
	EventColumnMoved       = "column.moved"
	EventColumnDeleted     = "column.deleted"
	EventLabelCreated      = "label.created"
	EventLabelUpdated      = "label.updated"
	EventLabelDeleted      = "label.deleted"
	EventLabelAttached     = "label.attached"
	EventLabelDetached     = "label.detached"
	EventCommentCreated    = "comment.created"
	EventCommentDeleted    = "comment.deleted"
	EventMilestoneCreated  = "milestone.created"
	EventMilestoneUpdated  = "milestone.updated"
	EventMilestoneDeleted  = "milestone.deleted"
	EventMilestoneAttached = "milestone.attached"
	EventMilestoneDetached = "milestone.detached"
	EventMemberCreated     = "member.created"
	EventMemberUpdated     = "member.updated"
	EventMemberDeleted     = "member.deleted"
	EventWorkspaceCreated  = "workspace.created"
	EventWorkspaceUpdated  = "workspace.updated"
	EventWorkspaceDeleted  = "workspace.deleted"
	EventProjectCreated    = "project.created"
	EventProjectUpdated    = "project.updated"
	EventProjectDeleted    = "project.deleted"
	EventProjectPinned     = "project.pinned"
	EventProjectUnpinned   = "project.unpinned"
)

// Event 描述一次写操作发生了什么，是活动记录与实时广播的唯一输入。
type Event struct {
	Action      string // 动作常量（见上）
	ProjectID   string // 项目级事件的项目；空表示工作区级事件
	WorkspaceID string // 工作区级事件的 workspace（项目级事件忽略）
	EntityID    string // 广播携带的主要实体 ID
	// ActivityTaskID 是活动归属的任务 ID（RecordActivity 时）；
	// 为空时回退到 EntityID（任务类事件两者相同，评论类事件不同）。
	ActivityTaskID string
	Data           any // 活动 data（JSON）；仅 RecordActivity 时使用
	// RecordActivity 表示是否写入全局活动流。任务事件同时会出现在任务详情时间线；
	// 其他资源事件只出现在全局活动页。
	RecordActivity bool
	// Actor 是执行者名（ADR-0013 决策 5）：为空时 dispatch 从 ctx 解析
	// （personal 恒 "Admin"，team 为成员名）。写操作调用处无需显式传。
	Actor string
}

// dispatch 是写操作副作用的唯一出口：先记活动，再广播。纪律只写一次。
// 项目级事件按项目归属写入并广播；工作区级事件写入工作区归属并全局广播。
// Actor 为空时从 ctx 解析（ADR-0013 决策 5）——写操作调用处无需显式传。
func (s *Service) dispatch(ctx context.Context, e Event) error {
	if e.Actor == "" {
		e.Actor = ActorFromContext(ctx)
	}
	if err := s.recordEvent(ctx, gen.New(s.db), e); err != nil {
		return err
	}
	s.broadcastEvent(e)
	return nil
}

// recordEvent writes the durable side effect using the supplied query handle.
// Transactional mutations call this before commit so a failed activity write
// rolls back the business mutation as well.
// Actor 为空时从 ctx 解析（与 dispatch 一致，ADR-0013 决策 5）——
// 事务内直接调用（如评论/标签/任务）无需逐处传 actor。
func (s *Service) recordEvent(ctx context.Context, q *gen.Queries, e Event) error {
	if !e.RecordActivity {
		return nil
	}
	if e.Actor == "" {
		e.Actor = ActorFromContext(ctx)
	}
	resourceID := e.ActivityTaskID
	if resourceID == "" {
		resourceID = e.EntityID
	}
	resourceType := "task"
	if e.ActivityTaskID == "" && !isTaskEvent(e.Action) {
		resourceType = resourceTypeForAction(e.Action)
	}
	return recordActivityWithQueries(ctx, q, resourceType, resourceID, e.ProjectID, e.WorkspaceID, e.Action, e.Data, e.Actor)
}

func isTaskEvent(action string) bool {
	switch action {
	case EventTaskCreated, EventTaskUpdated, EventTaskMoved, EventTaskDeleted,
		EventTaskArchived, EventTaskRestored, EventLabelAttached, EventLabelDetached,
		EventCommentCreated, EventCommentDeleted, EventMilestoneAttached, EventMilestoneDetached:
		return true
	default:
		return false
	}
}

func resourceTypeForAction(action string) string {
	switch action {
	case EventColumnCreated, EventColumnUpdated, EventColumnMoved, EventColumnDeleted:
		return "column"
	case EventLabelCreated, EventLabelUpdated, EventLabelDeleted:
		return "label"
	case EventMilestoneCreated, EventMilestoneUpdated, EventMilestoneDeleted:
		return "milestone"
	case EventMemberCreated, EventMemberUpdated, EventMemberDeleted:
		return "member"
	case EventProjectCreated, EventProjectUpdated, EventProjectDeleted,
		EventProjectPinned, EventProjectUnpinned:
		return "project"
	case EventWorkspaceCreated, EventWorkspaceUpdated, EventWorkspaceDeleted:
		return "workspace"
	default:
		return "workspace"
	}
}

// broadcastEvent must run after the transaction commits. Broadcast failures
// are intentionally non-fatal because clients re-fetch the source of truth.
func (s *Service) broadcastEvent(e Event) {
	if e.ProjectID == "" {
		s.emitAll(e.Action, e.WorkspaceID, e.EntityID)
		return
	}
	s.emit(e.ProjectID, e.Action, e.EntityID)
}
