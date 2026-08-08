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
	if err := s.recordActivity(ctx, task.ID, "task.created", map[string]string{"title": title}); err != nil {
		return gen.Task{}, "", err
	}
	s.emit(column.ProjectID, "task.created", task.ID)
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
	if err := s.recordActivity(ctx, task.ID, "task.updated", map[string]string{"title": task.Title}); err != nil {
		return gen.Task{}, err
	}
	s.emit(task.ProjectID, "task.updated", task.ID)
	return task, nil
}

// DeleteTask 删除任务；不存在时返回 ErrNotFound。
func (s *Service) DeleteTask(ctx context.Context, taskID string) error {
	task, err := gen.New(s.db).GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
	q := gen.New(s.db)
	// 先删活动（activity 无外键，需显式清理，spec：不保留孤儿记录）。
	if err := q.DeleteActivityByTask(ctx, taskID); err != nil {
		return fmt.Errorf("删除任务活动失败: %w", err)
	}
	n, err := q.DeleteTask(ctx, taskID)
	if err != nil {
		return fmt.Errorf("删除任务失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	s.emit(task.ProjectID, "task.deleted", taskID)
	return nil
}

// MoveTask 把任务移动到目标列的目标位置（0 起），源/目标列分别 reindex。
// 目标列缺省为当前列（同列排序）；不允许跨项目移动。
func (s *Service) MoveTask(ctx context.Context, taskID string, targetColumnID *string, targetPosition int64) error {
	q := gen.New(s.db)

	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
	sourceColumnID := task.ColumnID
	destColumnID := sourceColumnID
	if targetColumnID != nil {
		destColumnID = *targetColumnID
		if destColumnID != sourceColumnID {
			column, err := q.GetColumn(ctx, destColumnID)
			if err != nil {
				return mapNoRows(err)
			}
			if column.ProjectID != task.ProjectID {
				return fmt.Errorf("不能跨项目移动任务")
			}
		}
	}

	sourceTasks, err := q.ListTasksByColumn(ctx, sourceColumnID)
	if err != nil {
		return fmt.Errorf("查询源列任务失败: %w", err)
	}
	destTasks := sourceTasks
	if destColumnID != sourceColumnID {
		destTasks, err = q.ListTasksByColumn(ctx, destColumnID)
		if err != nil {
			return fmt.Errorf("查询目标列任务失败: %w", err)
		}
	}

	// 从源列表移除，再插入目标列表的目标位置。
	newSource := removeTask(sourceTasks, taskID)
	newDest := insertTask(removeTask(destTasks, taskID), task, targetPosition)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	tq := gen.New(tx)
	now := time.Now().UTC().Format(time.RFC3339)
	if destColumnID == sourceColumnID {
		// 同列移动：newDest 就是完整新列表（含被移任务），整体 reindex。
		if err := reindexTasks(ctx, tq, newDest, sourceColumnID, now); err != nil {
			return err
		}
	} else {
		// 跨列移动：源列（已移除）与目标列（已插入）分别 reindex。
		if err := reindexTasks(ctx, tq, newSource, sourceColumnID, now); err != nil {
			return err
		}
		if err := reindexTasks(ctx, tq, newDest, destColumnID, now); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	if err := s.recordActivity(ctx, taskID, "task.moved", map[string]string{
		"from": sourceColumnID,
		"to":   destColumnID,
	}); err != nil {
		return err
	}
	s.emit(task.ProjectID, "task.moved", taskID)
	return nil
}

// removeTask 从列表中移除指定任务。
func removeTask(tasks []gen.Task, taskID string) []gen.Task {
	out := make([]gen.Task, 0, len(tasks))
	for _, t := range tasks {
		if t.ID != taskID {
			out = append(out, t)
		}
	}
	return out
}

// insertTask 把任务插入列表的指定位置（越界收敛到两端）。
func insertTask(tasks []gen.Task, task gen.Task, position int64) []gen.Task {
	if position < 0 {
		position = 0
	}
	if position > int64(len(tasks)) {
		position = int64(len(tasks))
	}
	out := make([]gen.Task, 0, len(tasks)+1)
	out = append(out, tasks[:position]...)
	out = append(out, task)
	out = append(out, tasks[position:]...)
	return out
}

// reindexTasks 按列表顺序写入紧凑 position（0..n-1）。
func reindexTasks(ctx context.Context, q *gen.Queries, tasks []gen.Task, columnID, now string) error {
	for i, t := range tasks {
		if err := q.SetTaskPosition(ctx, gen.SetTaskPositionParams{
			ID:        t.ID,
			ColumnID:  columnID,
			Position:  int64(i),
			UpdatedAt: now,
		}); err != nil {
			return fmt.Errorf("更新任务位置失败: %w", err)
		}
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
