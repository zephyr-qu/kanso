package service

import "context"

// 事件动作常量（候选 4）：动作字符串只在此处定义，前端 lib/events.ts 与之对齐
// （ADR-0004 无共享类型包——两侧各自枚举，字符串值即合约）。

const (
	EventTaskCreated    = "task.created"
	EventTaskUpdated    = "task.updated"
	EventTaskMoved      = "task.moved"
	EventTaskDeleted    = "task.deleted"
	EventColumnCreated  = "column.created"
	EventColumnUpdated  = "column.updated"
	EventColumnMoved    = "column.moved"
	EventColumnDeleted  = "column.deleted"
	EventLabelCreated   = "label.created"
	EventLabelUpdated   = "label.updated"
	EventLabelDeleted   = "label.deleted"
	EventLabelAttached  = "label.attached"
	EventLabelDetached  = "label.detached"
	EventCommentCreated = "comment.created"
	EventCommentDeleted = "comment.deleted"
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
	Data        any // 活动 data（JSON）；仅 RecordActivity 时使用
	// RecordActivity 表示是否写入所属任务的 activity 流（任务生命周期类事件）。
	RecordActivity bool
}

// dispatch 是写操作副作用的唯一出口：先记活动，再广播。纪律只写一次。
// 项目级事件：recordActivity（可选）→ 按项目广播。
// 工作区级事件（标签 CRUD）：仅 BroadcastAll。
func (s *Service) dispatch(ctx context.Context, e Event) error {
	if e.ProjectID == "" {
		s.emitAll(e.Action, e.WorkspaceID, e.EntityID)
		return nil
	}
	if e.RecordActivity {
		resourceID := e.ActivityTaskID
		if resourceID == "" {
			resourceID = e.EntityID
		}
		if err := s.recordActivity(ctx, resourceID, e.Action, e.Data); err != nil {
			return err
		}
	}
	s.emit(e.ProjectID, e.Action, e.EntityID)
	return nil
}
