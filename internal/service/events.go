package service

import (
	"context"
	"database/sql"
	"fmt"

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
	EventCommentUpdated    = "comment.updated"
	EventCommentDeleted    = "comment.deleted"
	EventMilestoneCreated  = "milestone.created"
	EventMilestoneUpdated  = "milestone.updated"
	EventMilestoneDeleted  = "milestone.deleted"
	EventMilestoneAttached = "milestone.attached"
	EventMilestoneDetached = "milestone.detached"
	EventMemberCreated     = "member.created"
	EventMemberUpdated     = "member.updated"
	EventMemberDeleted     = "member.deleted"
	EventMemberKeyRotated  = "member.key_rotated"
	EventMemberKeyRevoked  = "member.key_revoked"
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

// commitEvents records a group of related events in one transaction. The
// business mutation and its audit trail commit together; broadcasts happen
// only after the shared commit succeeds.
func (s *Service) commitEvents(ctx context.Context, tx *sql.Tx, q *gen.Queries, events ...Event) error {
	for _, e := range events {
		if err := s.recordEvent(ctx, q, e); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	for _, e := range events {
		s.broadcastEvent(e)
	}
	return nil
}

// recordEvent writes the durable side effect using the supplied query handle.
// Transactional mutations call this before commit so a failed activity write
// rolls back the business mutation as well.
// Actor 为空时从 ctx 解析（与 dispatch 一致，ADR-0013 决策 5）——
// 事务内直接调用（如评论/标签/任务）无需逐处传 actor。
func (s *Service) recordEvent(ctx context.Context, q *gen.Queries, e Event) error {
	if e.WorkspaceID == "" && e.ProjectID != "" {
		if project, err := q.GetProject(ctx, e.ProjectID); err == nil {
			e.WorkspaceID = project.WorkspaceID
		}
	}
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
	if e.ActivityTaskID == "" {
		resourceType = resourceTypeForAction(e.Action)
	}
	return recordActivityWithQueries(ctx, q, resourceType, resourceID, e.ProjectID, e.WorkspaceID, e.Action, e.Data, e.Actor)
}

func resourceTypeForAction(action string) string {
	switch action {
	case EventTaskCreated, EventTaskUpdated, EventTaskMoved, EventTaskDeleted,
		EventTaskArchived, EventTaskRestored, EventLabelAttached, EventLabelDetached,
		EventCommentCreated, EventCommentUpdated, EventCommentDeleted, EventMilestoneAttached, EventMilestoneDetached:
		return "task"
	case EventColumnCreated, EventColumnUpdated, EventColumnMoved, EventColumnDeleted:
		return "column"
	case EventLabelCreated, EventLabelUpdated, EventLabelDeleted:
		return "label"
	case EventMilestoneCreated, EventMilestoneUpdated, EventMilestoneDeleted:
		return "milestone"
	case EventMemberCreated, EventMemberUpdated, EventMemberDeleted,
		EventMemberKeyRotated, EventMemberKeyRevoked:
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
	e.WorkspaceID = s.eventWorkspaceID(context.Background(), e)
	if e.ProjectID == "" {
		s.emitAll(e.Action, e.WorkspaceID, e.EntityID)
		return
	}
	s.emit(e.ProjectID, e.Action, e.EntityID)
	s.emitWorkspace(e.WorkspaceID, e.Action, e.EntityID)
}

func (s *Service) eventWorkspaceID(ctx context.Context, e Event) string {
	if e.WorkspaceID != "" || e.ProjectID == "" {
		return e.WorkspaceID
	}
	var workspaceID string
	if err := s.db.QueryRowContext(ctx, `SELECT workspace_id FROM project WHERE id = ?`, e.ProjectID).Scan(&workspaceID); err == nil {
		return workspaceID
	}
	return ""
}
