package service

import (
	"context"
	"strings"

	"kanso/internal/db/gen"
)

// SearchResult 是全局搜索（⌘K 命令面板）的一条任务命中。
type SearchResult struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	ColumnID      string  `json:"columnId"`
	Priority      string  `json:"priority"`
	DueDate       *string `json:"dueDate"`
	ProjectID     string  `json:"projectId"`
	ProjectName   string  `json:"projectName"`
	WorkspaceID   string  `json:"workspaceId"`
	WorkspaceName string  `json:"workspaceName"`
}

// SearchTasks 全局搜索任务（标题/描述/评论子串匹配，大小写不敏感）。
// 空查询返回最近更新的任务（命令面板未输入时的快捷入口）。
func (s *Service) SearchTasks(ctx context.Context, query string) ([]SearchResult, error) {
	q := gen.New(s.db)
	like := "%" + strings.ToLower(strings.TrimSpace(query)) + "%"
	rows, err := q.SearchTasks(ctx, gen.SearchTasksParams{
		Column1: &like,
		Column2: &like,
		Column3: &like,
	})
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []gen.SearchTasksRow{}
	}
	out := make([]SearchResult, 0, len(rows))
	for _, row := range rows {
		out = append(out, SearchResult{
			ID:            row.ID,
			Title:         row.Title,
			ColumnID:      row.ColumnID,
			Priority:      row.Priority,
			DueDate:       row.DueDate,
			ProjectID:     row.ProjectID,
			ProjectName:   row.ProjectName,
			WorkspaceID:   row.WorkspaceID,
			WorkspaceName: row.WorkspaceName,
		})
	}
	return out, nil
}
