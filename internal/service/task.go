package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// CreateTask 在列末尾创建任务（position 取 MAX+1，删除留洞也不会冲突）。
// priority 缺省 med；dueDate 为 nil 表示未设置截止日期（空串归一为 NULL）。
// labels 为项目内标签 ID 列表，创建时同事务内贴标签；跨项目标签返回 ErrCrossProjectMove。
// 返回任务与所属项目 ID。
func (s *Service) CreateTask(ctx context.Context, columnID, title, description string, priority string, dueDate *string, labels []string) (gen.Task, string, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Task{}, "", err
	}
	defer func() { _ = tx.Rollback() }()

	column, err := q.GetColumn(ctx, columnID)
	if err != nil {
		return gen.Task{}, "", mapNoRows(err)
	}

	position, err := q.MaxTaskPositionByColumn(ctx, columnID)
	if err != nil {
		return gen.Task{}, "", fmt.Errorf("计算任务位置失败: %w", err)
	}

	if priority == "" {
		priority = "med"
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
		Priority:    priority,
		DueDate:     nullableDueDate(dueDate),
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return gen.Task{}, "", fmt.Errorf("创建任务失败: %w", err)
	}

	// 创建时贴标签：与任务同事务（校验归属 + 插入），失败整体回滚。
	// 去重（保序）：重复标签 ID 只贴一次，避免产生重复 label.attached 活动。
	seen := make(map[string]struct{}, len(labels))
	var labelEvents []Event
	for _, labelID := range labels {
		if _, dup := seen[labelID]; dup {
			continue
		}
		seen[labelID] = struct{}{}
		label, err := q.GetLabel(ctx, labelID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return gen.Task{}, "", ErrLabelNotFound
			}
			return gen.Task{}, "", fmt.Errorf("查询标签失败: %w", err)
		}
		if label.ProjectID != column.ProjectID {
			return gen.Task{}, "", ErrCrossProjectMove
		}
		if _, err := q.AttachLabel(ctx, gen.AttachLabelParams{TaskID: task.ID, LabelID: labelID}); err != nil {
			return gen.Task{}, "", fmt.Errorf("贴标签失败: %w", err)
		}
		labelEvents = append(labelEvents, Event{
			Action:         EventLabelAttached,
			ProjectID:      column.ProjectID,
			EntityID:       task.ID,
			Data:           map[string]string{"label": label.Name},
			RecordActivity: true,
		})
	}
	event := Event{
		Action:         EventTaskCreated,
		ProjectID:      column.ProjectID,
		EntityID:       task.ID,
		Data:           map[string]string{"title": title},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Task{}, "", err
	}
	for _, le := range labelEvents {
		if err := s.recordEvent(ctx, q, le); err != nil {
			return gen.Task{}, "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return gen.Task{}, "", fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	for _, le := range labelEvents {
		s.broadcastEvent(le)
	}
	return task, column.ProjectID, nil
}

// UpdateTask 更新任务标题/描述/优先级/截止日期（指针字段为空表示不改）；
// dueDate 传空串指针表示清空截止日期。不存在时返回 ErrNotFound。
func (s *Service) UpdateTask(ctx context.Context, taskID string, title, description, priority *string, dueDate *string) (gen.Task, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Task{}, err
	}
	defer func() { _ = tx.Rollback() }()
	current, err := q.GetTask(ctx, taskID)
	if err != nil {
		return gen.Task{}, mapNoRows(err)
	}
	if title == nil {
		title = &current.Title
	}
	if description == nil {
		description = current.Description
	}
	if priority == nil {
		priority = &current.Priority
	}
	if dueDate == nil {
		dueDate = current.DueDate
	}
	// 空串 dueDate 归一为 NULL。
	var due *string
	if dueDate != nil && *dueDate != "" {
		due = dueDate
	}
	// 空串 description 归一为 NULL（与创建一致，S-12）。
	var desc *string
	if description != nil {
		desc = nullableString(*description)
	}
	task, err := q.UpdateTask(ctx, gen.UpdateTaskParams{
		ID:          taskID,
		Title:       *title,
		Description: desc,
		Priority:    *priority,
		DueDate:     due,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Task{}, fmt.Errorf("更新任务失败: %w", err)
	}
	event := Event{
		Action:         EventTaskUpdated,
		ProjectID:      task.ProjectID,
		EntityID:       task.ID,
		Data:           map[string]string{"title": task.Title},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Task{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return task, nil
}

// DeleteTask 删除任务；不存在时返回 ErrNotFound。
func (s *Service) DeleteTask(ctx context.Context, taskID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return mapNoRows(err)
	}
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
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交删除任务事务失败: %w", err)
	}
	return s.dispatch(ctx, Event{
		Action:    EventTaskDeleted,
		ProjectID: task.ProjectID,
		EntityID:  taskID,
	})
}

// SetTaskArchived changes the archive state without deleting task data.
// Repeating the same state is idempotent and does not create duplicate activity.
func (s *Service) SetTaskArchived(ctx context.Context, taskID string, archived bool) (gen.Task, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Task{}, err
	}
	defer func() { _ = tx.Rollback() }()
	current, err := q.GetTask(ctx, taskID)
	if err != nil {
		return gen.Task{}, mapNoRows(err)
	}
	if (current.ArchivedAt != nil) == archived {
		return current, nil
	}

	var archivedAt *string
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	restorePosition := current.Position
	if !archived {
		// 恢复时追加到列末尾，避免归档期间其他任务 reindex 后产生 position 冲突。
		restorePosition, err = q.MaxTaskPositionByColumn(ctx, current.ColumnID)
		if err != nil {
			return gen.Task{}, fmt.Errorf("计算恢复任务位置失败: %w", err)
		}
	}
	if archived {
		archivedAt = &updatedAt
	}
	task, err := q.ArchiveTask(ctx, gen.ArchiveTaskParams{ArchivedAt: archivedAt, UpdatedAt: updatedAt, ID: taskID})
	if err != nil {
		return gen.Task{}, fmt.Errorf("更新任务归档状态失败: %w", err)
	}
	if !archived {
		if err := q.SetTaskPosition(ctx, gen.SetTaskPositionParams{
			ID: task.ID, ColumnID: task.ColumnID, Position: restorePosition, UpdatedAt: updatedAt,
		}); err != nil {
			return gen.Task{}, fmt.Errorf("更新恢复任务位置失败: %w", err)
		}
		task.Position = restorePosition
		task.UpdatedAt = updatedAt
	}
	action := EventTaskRestored
	if archived {
		action = EventTaskArchived
	}
	event := Event{
		Action:    action,
		ProjectID: task.ProjectID,
		EntityID:  task.ID,
		// title 供活动文案展示「归档了任务『标题』/恢复了任务『标题』」（与 task.created 的 data 形状一致）。
		Data:           map[string]any{"archivedAt": archivedAt, "title": task.Title},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Task{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return task, nil
}

// MoveTask 把任务移动到目标列的目标位置（0 起），源/目标列分别 reindex。
// 目标列缺省为当前列（同列排序）；不允许跨项目移动。返回移动后的任务（0006 Phase 3 任务 3.1）。
func (s *Service) MoveTask(ctx context.Context, taskID string, targetColumnID *string, targetPosition int64) (gen.Task, error) {
	// 读（任务/列顺序）与写（reindex）在同一事务内：单连接（SetMaxOpenConns(1)）
	// 下后到的事务必在先前事务提交后才开始，读到的必是已提交的新顺序，
	// 不会基于旧顺序 reindex 覆盖他人提交。
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Task{}, err
	}
	defer func() { _ = tx.Rollback() }()

	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return gen.Task{}, mapNoRows(err)
	}
	sourceColumnID := task.ColumnID
	destColumnID := sourceColumnID
	if targetColumnID != nil {
		destColumnID = *targetColumnID
		if destColumnID != sourceColumnID {
			column, err := q.GetColumn(ctx, destColumnID)
			if err != nil {
				return gen.Task{}, mapNoRows(err)
			}
			if column.ProjectID != task.ProjectID {
				return gen.Task{}, ErrCrossProjectMove
			}
		}
	}

	sourceTasks, err := q.ListTasksByColumn(ctx, sourceColumnID)
	if err != nil {
		return gen.Task{}, fmt.Errorf("查询源列任务失败: %w", err)
	}
	destTasks := sourceTasks
	if destColumnID != sourceColumnID {
		destTasks, err = q.ListTasksByColumn(ctx, destColumnID)
		if err != nil {
			return gen.Task{}, fmt.Errorf("查询目标列任务失败: %w", err)
		}
	}

	// 从源列表移除，再插入目标列表的目标位置。
	newSource := removeTask(sourceTasks, taskID)
	newDest := insertTask(removeTask(destTasks, taskID), task, targetPosition)

	now := time.Now().UTC().Format(time.RFC3339)
	if destColumnID == sourceColumnID {
		// 同列移动：newDest 就是完整新列表（含被移任务），整体 reindex。
		if err := reindexTasks(ctx, q, newDest, sourceColumnID, now); err != nil {
			return gen.Task{}, err
		}
	} else {
		// 跨列移动：源列（已移除）与目标列（已插入）分别 reindex。
		if err := reindexTasks(ctx, q, newSource, sourceColumnID, now); err != nil {
			return gen.Task{}, err
		}
		if err := reindexTasks(ctx, q, newDest, destColumnID, now); err != nil {
			return gen.Task{}, err
		}
	}
	// 同列排序（from==to）仍广播实时同步，但不写活动行——避免活动流出现
	// 「移动了任务」噪音（S-9；完成趋势本就会过滤 from==to，这里从源头消除）。
	event := Event{
		Action:    EventTaskMoved,
		ProjectID: task.ProjectID,
		EntityID:  taskID,
		Data: map[string]string{
			"from": sourceColumnID,
			"to":   destColumnID,
		},
		RecordActivity: destColumnID != sourceColumnID,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return gen.Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return gen.Task{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	// 返回移动后的最新任务（columnId/position 已更新）。
	return gen.New(s.db).GetTask(ctx, taskID)
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

// nullableDueDate 归一截止日期：nil 或空串均返回 nil（NULL），非空返回指针。
// 创建路径与 UpdateTask 保持一致，避免空串被存成 ”（due_date IS NOT NULL 视为已设置）。
func nullableDueDate(v *string) *string {
	if v == nil || *v == "" {
		return nil
	}
	return v
}
