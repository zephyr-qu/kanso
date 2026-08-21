package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// BoardTask 是看板中携带标签与评论数的任务。
type BoardTask struct {
	gen.Task
	Labels       []gen.Label `json:"labels"`
	CommentCount int64       `json:"commentCount"`
}

// BoardColumn 是看板聚合中一列及其任务。
type BoardColumn struct {
	gen.Column
	Tasks []BoardTask `json:"tasks"`
}

// Board 是看板页单次拉取的聚合（列 + 任务 + 工作区标签）。
type Board struct {
	Project gen.Project   `json:"project"`
	Columns []BoardColumn `json:"columns"`
	Labels  []gen.Label   `json:"labels"`
}

// GetBoard 返回项目看板聚合；项目不存在时返回 ErrNotFound。
func (s *Service) GetBoard(ctx context.Context, projectID string) (Board, error) {
	q := gen.New(s.db)

	project, err := q.GetProject(ctx, projectID)
	if err != nil {
		return Board{}, mapNoRows(err)
	}

	columns, err := q.ListColumnsByProject(ctx, projectID)
	if err != nil {
		return Board{}, fmt.Errorf("查询列失败: %w", err)
	}

	tasks, err := q.ListTasksByProject(ctx, projectID)
	if err != nil {
		return Board{}, fmt.Errorf("查询任务失败: %w", err)
	}
	// 任务按列分组。
	tasksByColumn := make(map[string][]gen.Task, len(columns))
	for _, task := range tasks {
		tasksByColumn[task.ColumnID] = append(tasksByColumn[task.ColumnID], task)
	}

	// 任务标签按任务分组（单次查询，避免 N+1）。
	labelsByTask := make(map[string][]gen.Label)
	labelRows, err := q.ListTaskLabelsByProject(ctx, projectID)
	if err != nil {
		return Board{}, fmt.Errorf("查询任务标签失败: %w", err)
	}
	for _, row := range labelRows {
		labelsByTask[row.TaskID] = append(labelsByTask[row.TaskID], gen.Label{
			ID:        row.ID,
			ProjectID: row.ProjectID,
			Name:      row.Name,
			CreatedAt: row.CreatedAt,
		})
	}
	// 任务评论数（单次聚合，避免 N+1）。
	commentCounts := make(map[string]int64)
	commentRows, err := q.CountCommentsByProject(ctx, projectID)
	if err != nil {
		return Board{}, fmt.Errorf("查询任务评论数失败: %w", err)
	}
	for _, row := range commentRows {
		commentCounts[row.TaskID] = row.CommentCount
	}

	labels, err := q.ListLabelsByProject(ctx, projectID)
	if err != nil {
		return Board{}, fmt.Errorf("查询标签失败: %w", err)
	}
	if labels == nil {
		labels = []gen.Label{}
	}
	boardColumns := make([]BoardColumn, 0, len(columns))
	for _, column := range columns {
		tasks := tasksByColumn[column.ID]
		if tasks == nil {
			tasks = []gen.Task{}
		}
		boardTasks := make([]BoardTask, 0, len(tasks))
		for _, task := range tasks {
			labels := labelsByTask[task.ID]
			if labels == nil {
				labels = []gen.Label{}
			}
			boardTasks = append(boardTasks, BoardTask{
				Task:         task,
				Labels:       labels,
				CommentCount: commentCounts[task.ID],
			})
		}
		boardColumns = append(boardColumns, BoardColumn{
			Column: column,
			Tasks:  boardTasks,
		})
	}

	return Board{
		Project: project,
		Columns: boardColumns,
		Labels:  labels,
	}, nil
}

// ListArchivedTasks returns hidden tasks for the board archive panel.
func (s *Service) ListArchivedTasks(ctx context.Context, projectID string) ([]gen.Task, error) {
	if _, err := gen.New(s.db).GetProject(ctx, projectID); err != nil {
		return nil, mapNoRows(err)
	}
	tasks, err := gen.New(s.db).ListArchivedTasksByProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("查询归档任务失败: %w", err)
	}
	if tasks == nil {
		return []gen.Task{}, nil
	}
	return tasks, nil
}

// CreateColumn 在项目末尾追加新列。
func (s *Service) CreateColumn(ctx context.Context, projectID, name string, wipLimit *int64) (gen.Column, error) {
	q := gen.New(s.db)

	// 校验项目存在（外键会兜底，但这里给出清晰的 404）。
	if _, err := q.GetProject(ctx, projectID); err != nil {
		return gen.Column{}, mapNoRows(err)
	}

	// W-2：新列 position 取 MAX+1 而非 COUNT——删除中间列留洞后 COUNT 会与既有
	// position 冲突（同 position 两列都被视为末列，完成/趋势/里程碑口径错乱）。
	maxPos, err := q.MaxColumnPositionByProject(ctx, projectID)
	if err != nil {
		return gen.Column{}, fmt.Errorf("查询列最大位置失败: %w", err)
	}

	columnID, err := id.New()
	if err != nil {
		return gen.Column{}, err
	}
	column, err := q.CreateColumn(ctx, gen.CreateColumnParams{
		ID:        columnID,
		ProjectID: projectID,
		Name:      name,
		Position:  maxPos,
		WipLimit:  wipLimit, // 0006 Phase 3 任务 3.6：建列即设 WIP
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Column{}, fmt.Errorf("创建列失败: %w", err)
	}
	if err := s.dispatch(ctx, Event{Action: EventColumnCreated, ProjectID: projectID, EntityID: column.ID, Data: map[string]string{"name": column.Name}, RecordActivity: true}); err != nil {
		return gen.Column{}, err
	}
	return column, nil
}

// UpdateColumnWIP updates the optional warning threshold; nil clears it.
func (s *Service) UpdateColumnWIP(ctx context.Context, columnID string, limit *int64) (gen.Column, error) {
	if limit != nil && *limit < 0 {
		return gen.Column{}, fmt.Errorf("wip limit must be non-negative")
	}
	column, err := gen.New(s.db).UpdateColumnWIP(ctx, gen.UpdateColumnWIPParams{ID: columnID, WipLimit: limit})
	if err != nil {
		return gen.Column{}, mapNoRows(err)
	}
	if err := s.dispatch(ctx, Event{Action: EventColumnUpdated, ProjectID: column.ProjectID, EntityID: column.ID, Data: map[string]any{"name": column.Name, "wipLimit": limit}, RecordActivity: true}); err != nil {
		return gen.Column{}, err
	}
	return column, nil
}

// RenameColumn 重命名列；不存在时返回 ErrNotFound。
func (s *Service) RenameColumn(ctx context.Context, columnID, name string) (gen.Column, error) {
	column, err := gen.New(s.db).UpdateColumnName(ctx, gen.UpdateColumnNameParams{
		ID:   columnID,
		Name: name,
	})
	if err != nil {
		return gen.Column{}, mapNoRows(err)
	}
	if err := s.dispatch(ctx, Event{Action: EventColumnUpdated, ProjectID: column.ProjectID, EntityID: column.ID, Data: map[string]string{"name": column.Name}, RecordActivity: true}); err != nil {
		return gen.Column{}, err
	}
	return column, nil
}

// DeleteColumn 删除列（其下任务由外键级联删除）；不存在时返回 ErrNotFound。
func (s *Service) DeleteColumn(ctx context.Context, columnID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	column, err := q.GetColumn(ctx, columnID)
	if err != nil {
		return mapNoRows(err)
	}
	// 先清列内任务的活动（activity 无外键，需显式清理）。
	if err := q.DeleteActivitiesByColumn(ctx, columnID); err != nil {
		return fmt.Errorf("删除列活动失败: %w", err)
	}
	n, err := q.DeleteColumn(ctx, columnID)
	if err != nil {
		return fmt.Errorf("删除列失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交删除列事务失败: %w", err)
	}
	return s.dispatch(ctx, Event{Action: EventColumnDeleted, ProjectID: column.ProjectID, EntityID: columnID, Data: map[string]string{"name": column.Name}, RecordActivity: true})
}

// MoveColumn 把列移动到目标位置（0 起），整列列表重排（reindex）。
// 返回移动后的列（0006 Phase 3 任务 3.2）。
func (s *Service) MoveColumn(ctx context.Context, columnID string, targetPosition int64) (gen.Column, error) {
	// 读（列顺序）与写（reindex）在同一事务内：单连接下保证并发拖拽不覆盖他人提交。
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Column{}, err
	}
	defer func() { _ = tx.Rollback() }()

	column, err := q.GetColumn(ctx, columnID)
	if err != nil {
		return gen.Column{}, mapNoRows(err)
	}

	columns, err := q.ListColumnsByProject(ctx, column.ProjectID)
	if err != nil {
		return gen.Column{}, fmt.Errorf("查询列失败: %w", err)
	}

	// 从当前顺序中移除目标列，再插入新位置。
	order := make([]gen.Column, 0, len(columns))
	for _, c := range columns {
		if c.ID != columnID {
			order = append(order, c)
		}
	}
	if targetPosition < 0 {
		targetPosition = 0
	}
	if targetPosition > int64(len(order)) {
		targetPosition = int64(len(order))
	}
	order = append(order[:targetPosition], append([]gen.Column{column}, order[targetPosition:]...)...)

	for i, c := range order {
		if err := q.SetColumnPosition(ctx, gen.SetColumnPositionParams{
			ID:       c.ID,
			Position: int64(i),
		}); err != nil {
			return gen.Column{}, fmt.Errorf("更新列位置失败: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return gen.Column{}, fmt.Errorf("提交事务失败: %w", err)
	}
	if err := s.dispatch(ctx, Event{Action: EventColumnMoved, ProjectID: column.ProjectID, EntityID: columnID, Data: map[string]string{"name": column.Name}, RecordActivity: true}); err != nil {
		return gen.Column{}, err
	}
	// 返回移动后的最新列（position 已更新）。
	return gen.New(s.db).GetColumn(ctx, columnID)
}
