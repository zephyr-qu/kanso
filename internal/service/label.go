// 标签领域服务（0006 Phase 2：标签项目级）。
// 事务纪律与 task/comment 一致：变更 + 活动记录同事务提交（BeginTx + recordEvent）。
package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// CreateLabel 创建项目级标签；项目不存在时返回 ErrNotFound（此前 FK 违约映射 500）。
func (s *Service) CreateLabel(ctx context.Context, projectID, name string) (gen.Label, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Label{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := q.GetProject(ctx, projectID); err != nil {
		return gen.Label{}, mapNoRows(err)
	}
	labelID, err := id.New()
	if err != nil {
		return gen.Label{}, err
	}
	label, err := q.CreateLabel(ctx, gen.CreateLabelParams{
		ID:        labelID,
		ProjectID: projectID,
		Name:      name,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Label{}, fmt.Errorf("创建标签失败: %w", err)
	}
	event := Event{Action: EventLabelCreated, ProjectID: projectID, EntityID: label.ID}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Label{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Label{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return label, nil
}

// UpdateLabel 更新标签名称；不存在时返回 ErrNotFound。
func (s *Service) UpdateLabel(ctx context.Context, labelID string, name *string) (gen.Label, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Label{}, err
	}
	defer func() { _ = tx.Rollback() }()

	current, err := q.GetLabel(ctx, labelID)
	if err != nil {
		return gen.Label{}, mapNoRows(err)
	}
	newName := current.Name
	if name != nil {
		newName = *name
	}
	label, err := q.UpdateLabel(ctx, gen.UpdateLabelParams{ID: labelID, Name: newName})
	if err != nil {
		return gen.Label{}, fmt.Errorf("更新标签失败: %w", err)
	}
	event := Event{Action: EventLabelUpdated, ProjectID: label.ProjectID, EntityID: label.ID}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Label{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Label{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return label, nil
}

// DeleteLabel 删除标签（任务上的关联由外键级联清除）；不存在时返回 ErrNotFound。
func (s *Service) DeleteLabel(ctx context.Context, labelID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	label, err := q.GetLabel(ctx, labelID)
	if err != nil {
		return mapNoRows(err)
	}
	n, err := q.DeleteLabel(ctx, labelID)
	if err != nil {
		return fmt.Errorf("删除标签失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	event := Event{Action: EventLabelDeleted, ProjectID: label.ProjectID, EntityID: labelID}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return nil
}

// AttachLabel 给任务贴标签（幂等）；任务或标签不存在时返回 ErrNotFound。
func (s *Service) AttachLabel(ctx context.Context, taskID, labelID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
	label, err := q.GetLabel(ctx, labelID)
	if err != nil {
		return mapNoRows(err)
	}
	if label.ProjectID != task.ProjectID {
		return ErrCrossProjectMove
	}
	inserted, err := q.AttachLabel(ctx, gen.AttachLabelParams{TaskID: taskID, LabelID: labelID})
	if err != nil {
		return fmt.Errorf("贴标签失败: %w", err)
	}
	if inserted == 0 {
		return tx.Commit()
	}
	event := Event{
		Action:         EventLabelAttached,
		ProjectID:      task.ProjectID,
		EntityID:       taskID,
		Data:           map[string]string{"label": label.Name},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return nil
}

// DetachLabel 从任务移除标签（幂等）；data 带标签名（0006 Phase 3 任务 3.5：
// 与 events.ts 契约一致，此前误用 labelID 导致前端活动文案空白）。
func (s *Service) DetachLabel(ctx context.Context, taskID, labelID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
	label, err := q.GetLabel(ctx, labelID)
	if err != nil {
		return mapNoRows(err)
	}
	if label.ProjectID != task.ProjectID {
		return ErrCrossProjectMove
	}
	deleted, err := q.DetachLabel(ctx, gen.DetachLabelParams{TaskID: taskID, LabelID: labelID})
	if err != nil {
		return fmt.Errorf("移除标签失败: %w", err)
	}
	if deleted == 0 {
		return tx.Commit()
	}
	event := Event{
		Action:         EventLabelDetached,
		ProjectID:      task.ProjectID,
		EntityID:       taskID,
		Data:           map[string]string{"label": label.Name},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return nil
}
