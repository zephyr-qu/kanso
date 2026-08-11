// Backup 导出：全量数据 JSON 快照（只导出不提供恢复）。
// 前端 settings 页仅下载保存原始 JSON，平铺数组结构即可（mock 嵌套结构不构成契约约束）。
package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
)

type BackupData struct {
	ExportedAt string          `json:"exportedAt"`
	Workspaces []gen.Workspace `json:"workspaces"`
	Projects   []gen.Project   `json:"projects"`
	Columns    []gen.Column    `json:"columns"`
	Tasks      []gen.Task      `json:"tasks"`
	Labels     []gen.Label     `json:"labels"`
	TaskLabels []gen.TaskLabel `json:"taskLabels"`
	Comments   []gen.Comment   `json:"comments"`
	Activities []gen.Activity  `json:"activities"`
}

// GetBackup 导出全部数据快照。
func (s *Service) GetBackup(ctx context.Context) (BackupData, error) {
	q := gen.New(s.db)

	var err error
	b := BackupData{ExportedAt: time.Now().UTC().Format(time.RFC3339)}

	if b.Workspaces, err = q.ListWorkspaces(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出工作区失败: %w", err)
	}
	if b.Projects, err = q.ListAllProjects(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出项目失败: %w", err)
	}
	if b.Columns, err = q.ListAllColumns(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出列失败: %w", err)
	}
	if b.Tasks, err = q.ListAllTasksFull(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出任务失败: %w", err)
	}
	if b.Labels, err = q.ListAllLabels(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出标签失败: %w", err)
	}
	if b.TaskLabels, err = q.ListAllTaskLabels(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出任务标签关联失败: %w", err)
	}
	if b.Comments, err = q.ListAllComments(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出评论失败: %w", err)
	}
	if b.Activities, err = q.ListAllActivities(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出活动失败: %w", err)
	}

	// 空集合保持 [] 而非 null（前端契约一致性）。
	if b.Workspaces == nil {
		b.Workspaces = []gen.Workspace{}
	}
	if b.Projects == nil {
		b.Projects = []gen.Project{}
	}
	if b.Columns == nil {
		b.Columns = []gen.Column{}
	}
	if b.Tasks == nil {
		b.Tasks = []gen.Task{}
	}
	if b.Labels == nil {
		b.Labels = []gen.Label{}
	}
	if b.TaskLabels == nil {
		b.TaskLabels = []gen.TaskLabel{}
	}
	if b.Comments == nil {
		b.Comments = []gen.Comment{}
	}
	if b.Activities == nil {
		b.Activities = []gen.Activity{}
	}

	return b, nil
}
