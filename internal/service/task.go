package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// CreateTask 在列末尾创建任务（position 取 MAX+1，删除留洞也不会冲突）。
// 返回任务与所属项目 ID。
func (s *Service) CreateTask(ctx context.Context, columnID, title, description string) (gen.Task, string, error) {
	q := gen.New(s.db)

	column, err := q.GetColumn(ctx, columnID)
	if err != nil {
		return gen.Task{}, "", mapNoRows(err)
	}

	position, err := q.MaxTaskPositionByColumn(ctx, columnID)
	if err != nil {
		return gen.Task{}, "", fmt.Errorf("计算任务位置失败: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	taskID, err := id.New()
	if err != nil {
		return gen.Task{}, "", err
	}
	task, err := q.CreateTask(ctx, gen.CreateTaskParams{
		ID:          taskID,
		ProjectID:   column.ProjectID,
		ColumnID:    columnID,
		Title:       title,
		Description: nullableString(description),
		Position:    position,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return gen.Task{}, "", fmt.Errorf("创建任务失败: %w", err)
	}
	return task, column.ProjectID, nil
}

// UpdateTask 更新任务标题与描述（指针字段为空表示不改）；不存在时返回 ErrNotFound。
func (s *Service) UpdateTask(ctx context.Context, taskID string, title, description *string) (gen.Task, error) {
	current, err := gen.New(s.db).GetTask(ctx, taskID)
	if err != nil {
		return gen.Task{}, mapNoRows(err)
	}
	if title == nil {
		title = &current.Title
	}
	if description == nil {
		description = current.Description
	}
	task, err := gen.New(s.db).UpdateTask(ctx, gen.UpdateTaskParams{
		ID:          taskID,
		Title:       *title,
		Description: description,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Task{}, fmt.Errorf("更新任务失败: %w", err)
	}
	return task, nil
}

// DeleteTask 删除任务；不存在时返回 ErrNotFound。
func (s *Service) DeleteTask(ctx context.Context, taskID string) error {
	n, err := gen.New(s.db).DeleteTask(ctx, taskID)
	if err != nil {
		return fmt.Errorf("删除任务失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// nullableString 空串返回 nil（NULL），非空返回指针。
func nullableString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
