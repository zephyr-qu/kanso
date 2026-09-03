package service

import (
	"context"
	"fmt"
)

type CalendarItem struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"projectId"`
	ColumnID    string  `json:"columnId"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Position    int64   `json:"position"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	ArchivedAt  *string `json:"archivedAt"`
	ProjectName string  `json:"projectName"`
	WorkspaceID string  `json:"workspaceId"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"dueDate"`
}

// ListCalendarTasks returns only active tasks from one workspace.
func (s *Service) ListCalendarTasks(ctx context.Context, workspaceID string) ([]CalendarItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.project_id, t.column_id, t.title, t.description, t.position,
		       t.created_at, t.updated_at, t.archived_at, p.name, p.workspace_id,
		       t.priority, t.due_date
		FROM task t
		JOIN project p ON p.id = t.project_id
		WHERE p.workspace_id = ? AND t.archived_at IS NULL AND t.due_date IS NOT NULL
		ORDER BY t.due_date, t.updated_at DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询日历任务失败: %w", err)
	}
	defer rows.Close()
	result := []CalendarItem{}
	for rows.Next() {
		var item CalendarItem
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.ColumnID, &item.Title, &item.Description, &item.Position,
			&item.CreatedAt, &item.UpdatedAt, &item.ArchivedAt, &item.ProjectName, &item.WorkspaceID, &item.Priority, &item.DueDate); err != nil {
			return nil, fmt.Errorf("读取日历任务失败: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历日历任务失败: %w", err)
	}
	return result, nil
}
