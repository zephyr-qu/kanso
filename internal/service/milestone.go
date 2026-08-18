// Milestone 领域服务（0006 Phase 3 任务 3.8/3.9）：CRUD、任务关联、进度聚合。
// 事务纪律与 task/comment 一致：变更在同事务内提交（BeginTx + recordEvent）；
// recordEvent 仅当 Event.RecordActivity 为 true 时写活动，里程碑事件默认只广播。
package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// Milestone 是返回给前端的里程碑 DTO（内嵌基础字段 + 进度聚合）。
// Progress 口径（0006 Phase 3 任务 3.8 / 0005 §5.4）：关联任务中未归档且位于项目末列数 / 关联任务总数。
type Milestone struct {
	gen.Milestone
	Progress *MilestoneProgress `json:"progress"`
}

// MilestoneProgress 里程碑进度（与前端 board.ts progress 形状一致）。
type MilestoneProgress struct {
	Done  int64 `json:"done"`
	Total int64 `json:"total"`
}

func (s *Service) ListMilestones(ctx context.Context, projectID string) ([]Milestone, error) {
	if _, err := gen.New(s.db).GetProject(ctx, projectID); err != nil {
		return nil, mapNoRows(err)
	}
	items, err := gen.New(s.db).ListMilestonesByProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("查询里程碑失败: %w", err)
	}
	progress, err := gen.New(s.db).ListMilestoneProgress(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("查询里程碑进度失败: %w", err)
	}
	progressByID := make(map[string]gen.ListMilestoneProgressRow, len(progress))
	for _, p := range progress {
		progressByID[p.MilestoneID] = p
	}
	out := make([]Milestone, 0, len(items))
	for _, item := range items {
		m := Milestone{Milestone: item}
		if p, ok := progressByID[item.ID]; ok {
			m.Progress = &MilestoneProgress{Done: p.Done, Total: p.Total}
		}
		out = append(out, m)
	}
	return out, nil
}

// CreateMilestone 创建里程碑（名称必填）；项目不存在时返回 ErrNotFound。
// dueDate 空串归一为 NULL（与任务口径一致）。
func (s *Service) CreateMilestone(ctx context.Context, projectID, name string, dueDate *string) (gen.Milestone, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Milestone{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := q.GetProject(ctx, projectID); err != nil {
		return gen.Milestone{}, mapNoRows(err)
	}
	milestoneID, err := id.New()
	if err != nil {
		return gen.Milestone{}, err
	}
	milestone, err := q.CreateMilestone(ctx, gen.CreateMilestoneParams{
		ID:        milestoneID,
		ProjectID: projectID,
		Name:      name,
		DueDate:   nullableDueDate(dueDate),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Milestone{}, fmt.Errorf("创建里程碑失败: %w", err)
	}
	event := Event{Action: EventMilestoneCreated, ProjectID: projectID, EntityID: milestone.ID}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Milestone{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Milestone{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return milestone, nil
}

// UpdateMilestone 更新里程碑名称/截止日期（指针字段为 nil 表示不改，与 UpdateTask 同语义）。
// dueDate 空串归一为 NULL（清空）；省略字段保留现值，不会误清。
func (s *Service) UpdateMilestone(ctx context.Context, id string, name *string, dueDate *string) (gen.Milestone, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Milestone{}, err
	}
	defer func() { _ = tx.Rollback() }()

	current, err := q.GetMilestone(ctx, id)
	if err != nil {
		return gen.Milestone{}, mapNoRows(err)
	}
	newName := current.Name
	if name != nil {
		newName = *name
	}
	// dueDate 为 nil 表示省略字段：保留现值；显式空串表示清空（nullableDueDate 归一 NULL）。
	newDueDate := current.DueDate
	if dueDate != nil {
		newDueDate = dueDate
	}
	milestone, err := q.UpdateMilestone(ctx, gen.UpdateMilestoneParams{
		ID:      id,
		Name:    newName,
		DueDate: nullableDueDate(newDueDate),
	})
	if err != nil {
		return gen.Milestone{}, mapNoRows(err)
	}
	event := Event{Action: EventMilestoneUpdated, ProjectID: milestone.ProjectID, EntityID: milestone.ID}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Milestone{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Milestone{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return milestone, nil
}

// DeleteMilestone 删除里程碑（任务关联由外键级联清除）；不存在时返回 ErrNotFound。
func (s *Service) DeleteMilestone(ctx context.Context, id string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	milestone, err := q.GetMilestone(ctx, id)
	if err != nil {
		return mapNoRows(err)
	}
	if n, err := q.DeleteMilestone(ctx, id); err != nil {
		return err
	} else if n == 0 {
		return ErrNotFound
	}
	event := Event{Action: EventMilestoneDeleted, ProjectID: milestone.ProjectID, EntityID: id}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return nil
}

// SetTaskMilestone 关联/解除任务与里程碑（幂等）；跨项目返回 ErrCrossProjectMove。
// 事务纪律与兄弟写操作一致：BeginTx + recordEvent 同事务提交，提交后广播。
func (s *Service) SetTaskMilestone(ctx context.Context, taskID, milestoneID string, attached bool) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
	milestone, err := q.GetMilestone(ctx, milestoneID)
	if err != nil {
		return mapNoRows(err)
	}
	if task.ProjectID != milestone.ProjectID {
		return ErrCrossProjectMove
	}
	var affected int64
	if attached {
		affected, err = q.AttachTaskMilestone(ctx, gen.AttachTaskMilestoneParams{TaskID: taskID, MilestoneID: milestoneID})
	} else {
		affected, err = q.DetachTaskMilestone(ctx, gen.DetachTaskMilestoneParams{TaskID: taskID, MilestoneID: milestoneID})
	}
	if err != nil {
		return err
	}
	if affected == 0 {
		return nil
	}
	action := EventMilestoneDetached
	if attached {
		action = EventMilestoneAttached
	}
	event := Event{Action: action, ProjectID: task.ProjectID, EntityID: taskID, Data: map[string]string{"milestoneId": milestoneID}}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return nil
}

// MilestoneTask 里程碑关联的任务摘要(M5 详情面板)。
type MilestoneTask struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	ColumnName string `json:"columnName"`
	Archived   bool   `json:"archived"`
}

// ListMilestoneTasks 返回该里程碑关联的任务(task_milestone 多对多);里程碑不存在返回 ErrNotFound。
func (s *Service) ListMilestoneTasks(ctx context.Context, milestoneID string) ([]MilestoneTask, error) {
	if _, err := gen.New(s.db).GetMilestone(ctx, milestoneID); err != nil {
		return nil, mapNoRows(err)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT t.id, t.title, c.name AS column_name,
		CASE WHEN t.archived_at IS NULL THEN 0 ELSE 1 END AS archived
		FROM task t
		JOIN task_milestone tm ON tm.task_id = t.id
		JOIN column c ON c.id = t.column_id
		WHERE tm.milestone_id = ?
		ORDER BY t.created_at`, milestoneID)
	if err != nil {
		return nil, fmt.Errorf("查询里程碑任务失败: %w", err)
	}
	defer rows.Close()
	out := make([]MilestoneTask, 0)
	for rows.Next() {
		var mt MilestoneTask
		if err := rows.Scan(&mt.ID, &mt.Title, &mt.ColumnName, &mt.Archived); err != nil {
			return nil, fmt.Errorf("扫描里程碑任务失败: %w", err)
		}
		out = append(out, mt)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历里程碑任务失败: %w", err)
	}
	return out, nil
}

