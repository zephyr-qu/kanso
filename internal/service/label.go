package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// ListLabels 返回工作区下的标签库（按创建时间排序）。
func (s *Service) ListLabels(ctx context.Context, workspaceID string) ([]gen.Label, error) {
	labels, err := gen.New(s.db).ListLabelsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询标签失败: %w", err)
	}
	if labels == nil {
		return []gen.Label{}, nil
	}
	return labels, nil
}

// CreateLabel 创建工作区级标签。
func (s *Service) CreateLabel(ctx context.Context, workspaceID, name, color string) (gen.Label, error) {
	labelID, err := id.New()
	if err != nil {
		return gen.Label{}, err
	}
	return gen.New(s.db).CreateLabel(ctx, gen.CreateLabelParams{
		ID:          labelID,
		WorkspaceID: workspaceID,
		Name:        name,
		Color:       color,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

// UpdateLabel 更新标签名称与颜色（指针字段为空表示不改）；不存在时返回 ErrNotFound。
func (s *Service) UpdateLabel(ctx context.Context, labelID string, name, color *string) (gen.Label, error) {
	current, err := gen.New(s.db).GetLabel(ctx, labelID)
	if err != nil {
		return gen.Label{}, mapNoRows(err)
	}
	if name == nil {
		name = &current.Name
	}
	if color == nil {
		color = &current.Color
	}
	label, err := gen.New(s.db).UpdateLabel(ctx, gen.UpdateLabelParams{
		ID:    labelID,
		Name:  *name,
		Color: *color,
	})
	if err != nil {
		return gen.Label{}, fmt.Errorf("更新标签失败: %w", err)
	}
	return label, nil
}

// DeleteLabel 删除标签（任务上的关联由外键级联清除）。
func (s *Service) DeleteLabel(ctx context.Context, labelID string) error {
	n, err := gen.New(s.db).DeleteLabel(ctx, labelID)
	if err != nil {
		return fmt.Errorf("删除标签失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// AttachLabel 给任务贴标签（幂等）；任务或标签不存在时返回 ErrNotFound。
func (s *Service) AttachLabel(ctx context.Context, taskID, labelID string) error {
	q := gen.New(s.db)
	if _, err := q.GetTask(ctx, taskID); err != nil {
		return mapNoRows(err)
	}
	label, err := q.GetLabel(ctx, labelID)
	if err != nil {
		return mapNoRows(err)
	}
	if err := q.AttachLabel(ctx, gen.AttachLabelParams{TaskID: taskID, LabelID: labelID}); err != nil {
		return fmt.Errorf("贴标签失败: %w", err)
	}
	return s.recordActivity(ctx, taskID, "label.attached", map[string]string{"label": label.Name})
}

// DetachLabel 从任务移除标签（幂等）。
func (s *Service) DetachLabel(ctx context.Context, taskID, labelID string) error {
	if err := gen.New(s.db).DetachLabel(ctx, gen.DetachLabelParams{TaskID: taskID, LabelID: labelID}); err != nil {
		return fmt.Errorf("移除标签失败: %w", err)
	}
	return s.recordActivity(ctx, taskID, "label.detached", map[string]string{"labelID": labelID})
}
