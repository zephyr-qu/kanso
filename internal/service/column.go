package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// BoardTask 是看板中携带标签的任务。
type BoardTask struct {
	gen.Task
	Labels []gen.Label `json:"labels"`
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
			ID:          row.ID,
			WorkspaceID: row.WorkspaceID,
			Name:        row.Name,
			Color:       row.Color,
			CreatedAt:   row.CreatedAt,
		})
	}
	labels, err := q.ListLabelsByWorkspace(ctx, project.WorkspaceID)
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
				Task:   task,
				Labels: labels,
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

// CreateColumn 在项目末尾追加新列。
func (s *Service) CreateColumn(ctx context.Context, projectID, name string) (gen.Column, error) {
	q := gen.New(s.db)

	// 校验项目存在（外键会兜底，但这里给出清晰的 404）。
	if _, err := q.GetProject(ctx, projectID); err != nil {
		return gen.Column{}, mapNoRows(err)
	}

	count, err := q.CountColumnsByProject(ctx, projectID)
	if err != nil {
		return gen.Column{}, fmt.Errorf("统计列失败: %w", err)
	}

	columnID, err := id.New()
	if err != nil {
		return gen.Column{}, err
	}
	column, err := q.CreateColumn(ctx, gen.CreateColumnParams{
		ID:        columnID,
		ProjectID: projectID,
		Name:      name,
		Position:  count,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Column{}, fmt.Errorf("创建列失败: %w", err)
	}
	if err := s.dispatch(ctx, Event{Action: EventColumnCreated, ProjectID: projectID, EntityID: column.ID}); err != nil {
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
	if err := s.dispatch(ctx, Event{Action: EventColumnUpdated, ProjectID: column.ProjectID, EntityID: column.ID}); err != nil {
		return gen.Column{}, err
	}
	return column, nil
}

// DeleteColumn 删除列（其下任务由外键级联删除）；不存在时返回 ErrNotFound。
func (s *Service) DeleteColumn(ctx context.Context, columnID string) error {
	q := gen.New(s.db)
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
	return s.dispatch(ctx, Event{Action: EventColumnDeleted, ProjectID: column.ProjectID, EntityID: columnID})
}

// MoveColumn 把列移动到目标位置（0 起），整列列表重排（reindex）。
func (s *Service) MoveColumn(ctx context.Context, columnID string, targetPosition int64) error {
	// 读（列顺序）与写（reindex）在同一事务内：单连接下保证并发拖拽不覆盖他人提交。
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	q := gen.New(tx)

	column, err := q.GetColumn(ctx, columnID)
	if err != nil {
		return mapNoRows(err)
	}

	columns, err := q.ListColumnsByProject(ctx, column.ProjectID)
	if err != nil {
		return fmt.Errorf("查询列失败: %w", err)
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
			return fmt.Errorf("更新列位置失败: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	return s.dispatch(ctx, Event{Action: EventColumnMoved, ProjectID: column.ProjectID, EntityID: columnID})
}
