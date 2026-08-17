// Backup 导出/导入：全量数据 JSON 快照（导出）+ 全量替换恢复（导入）。
// 前端 settings 页仅下载保存原始 JSON，平铺数组结构即可（mock 嵌套结构不构成契约约束）。
package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"kanso/internal/db/gen"
)

type BackupData struct {
	ExportedAt     string              `json:"exportedAt"`
	Workspaces     []gen.Workspace     `json:"workspaces"`
	Projects       []gen.Project       `json:"projects"`
	Columns        []gen.Column        `json:"columns"`
	Tasks          []gen.Task          `json:"tasks"`
	Labels         []gen.Label         `json:"labels"`
	Milestones     []gen.Milestone     `json:"milestones"`
	TaskLabels     []gen.TaskLabel     `json:"taskLabels"`
	TaskMilestones []gen.TaskMilestone `json:"taskMilestones"`
	Comments       []gen.Comment       `json:"comments"`
	Activities     []gen.Activity      `json:"activities"`
}

// GetBackup 导出全部数据快照。
func (s *Service) GetBackup(ctx context.Context) (BackupData, error) {
	// 只读事务：全部表在同一快照下导出，避免并发写导致撕裂快照。
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return BackupData{}, fmt.Errorf("开启只读事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	q := gen.New(tx)

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
	if b.Milestones, err = q.ListAllMilestones(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出里程碑失败: %w", err)
	}
	if b.TaskLabels, err = q.ListAllTaskLabels(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出任务标签关联失败: %w", err)
	}
	// 0006 Phase 3 任务 3.9：备份快照补齐 taskMilestones（0005 §5.7 契约要求）。
	if b.TaskMilestones, err = q.ListAllTaskMilestones(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出任务里程碑关联失败: %w", err)
	}
	if b.Comments, err = q.ListAllComments(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出评论失败: %w", err)
	}
	if b.Activities, err = q.ListAllActivities(ctx); err != nil {
		return BackupData{}, fmt.Errorf("导出活动失败: %w", err)
	}

	// 空集合保持 [] 而非 null（前端契约一致性）。
	b.Workspaces = orEmpty(b.Workspaces)
	b.Projects = orEmpty(b.Projects)
	b.Columns = orEmpty(b.Columns)
	b.Milestones = orEmpty(b.Milestones)
	b.Tasks = orEmpty(b.Tasks)
	b.Labels = orEmpty(b.Labels)
	b.TaskLabels = orEmpty(b.TaskLabels)
	b.TaskMilestones = orEmpty(b.TaskMilestones)
	b.Comments = orEmpty(b.Comments)
	b.Activities = orEmpty(b.Activities)

	if err := tx.Commit(); err != nil {
		return BackupData{}, fmt.Errorf("提交只读事务失败: %w", err)
	}
	return b, nil
}

// ImportBackup 全量替换恢复：同一事务内清空全部业务表，再按依赖序写回快照。
// 语义为「恢复还原」——保留快照原始 ID，覆盖（丢弃）当前全部数据。
// 成员（member）不随快照迁移：清空前快照、恢复后原样写回，认证态不因导入而丢失。
func (s *Service) ImportBackup(ctx context.Context, b BackupData) error {
	// 空 workspace 快照会清空当前数据库并同时丢失成员归属，导致服务无法再认证。
	// 备份导出始终至少包含默认工作区，因此将其视为非法输入。
	if len(b.Workspaces) == 0 {
		return ErrInvalidBackup
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启导入事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// 快照当前成员：导入不迁移成员（访问密钥属认证态，不该随备份文件流转），
	// 但清空 workspace 会级联删除 member（ON DELETE CASCADE），需在清空前保存并写回。
	members, err := gen.New(tx).ListAllMembers(ctx)
	if err != nil {
		return fmt.Errorf("快照成员失败: %w", err)
	}

	// 清空各表（子→父；FR 依赖由 ON DELETE CASCADE 兜底，逐表清更显式）。
	for _, table := range []string{
		"activity", "task_label", "task_milestone", "comment", "task",
		"label", "column", "milestone", "project", "member", "workspace",
	} {
		// 表名为代码内常量（非用户输入），无注入面。
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			return fmt.Errorf("清空表 %s 失败: %w", table, err)
		}
	}

	q := gen.New(tx)
	for _, w := range b.Workspaces {
		if err := q.ImportWorkspaces(ctx, gen.ImportWorkspacesParams{ID: w.ID, Name: w.Name, CreatedAt: w.CreatedAt}); err != nil {
			return fmt.Errorf("导入工作区失败: %w", err)
		}
	}
	// 成员写回：挂到快照中存在的工作区；快照不含该工作区（跨实例迁移）时回退到
	// 首个恢复的工作区。快照无工作区则无法挂载，跳过（退化场景，认证态随库丢失）。
	restoredWS := make(map[string]bool, len(b.Workspaces))
	fallbackWS := ""
	for i, w := range b.Workspaces {
		restoredWS[w.ID] = true
		if i == 0 {
			fallbackWS = w.ID
		}
	}
	for _, m := range members {
		wsID := m.WorkspaceID
		if !restoredWS[wsID] {
			wsID = fallbackWS
		}
		if wsID == "" {
			continue
		}
		if err := q.ImportMembers(ctx, gen.ImportMembersParams{ID: m.ID, WorkspaceID: wsID, Name: m.Name, Role: m.Role, AvatarColor: m.AvatarColor, Avatar: m.Avatar, AccessKey: m.AccessKey, CreatedAt: m.CreatedAt}); err != nil {
			return fmt.Errorf("写回成员失败: %w", err)
		}
	}
	for _, p := range b.Projects {
		if err := q.ImportProjects(ctx, gen.ImportProjectsParams{ID: p.ID, WorkspaceID: p.WorkspaceID, Name: p.Name, Position: p.Position, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}); err != nil {
			return fmt.Errorf("导入项目失败: %w", err)
		}
	}
	for _, c := range b.Columns {
		if err := q.ImportColumns(ctx, gen.ImportColumnsParams{ID: c.ID, ProjectID: c.ProjectID, Name: c.Name, Position: c.Position, WipLimit: c.WipLimit, CreatedAt: c.CreatedAt}); err != nil {
			return fmt.Errorf("导入列失败: %w", err)
		}
	}
	for _, m := range b.Milestones {
		if err := q.ImportMilestones(ctx, gen.ImportMilestonesParams{ID: m.ID, ProjectID: m.ProjectID, Name: m.Name, DueDate: m.DueDate, CreatedAt: m.CreatedAt}); err != nil {
			return fmt.Errorf("导入里程碑失败: %w", err)
		}
	}
	for _, t := range b.Tasks {
		if err := q.ImportTasks(ctx, gen.ImportTasksParams{ID: t.ID, ProjectID: t.ProjectID, ColumnID: t.ColumnID, Title: t.Title, Description: t.Description, Position: t.Position, Priority: t.Priority, DueDate: t.DueDate, ArchivedAt: t.ArchivedAt, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}); err != nil {
			return fmt.Errorf("导入任务失败: %w", err)
		}
	}
	for _, l := range b.Labels {
		if err := q.ImportLabels(ctx, gen.ImportLabelsParams{ID: l.ID, ProjectID: l.ProjectID, Name: l.Name, CreatedAt: l.CreatedAt}); err != nil {
			return fmt.Errorf("导入标签失败: %w", err)
		}
	}
	for _, cm := range b.Comments {
		if err := q.ImportComments(ctx, gen.ImportCommentsParams{ID: cm.ID, TaskID: cm.TaskID, Content: cm.Content, CreatedAt: cm.CreatedAt, Author: cm.Author}); err != nil {
			return fmt.Errorf("导入评论失败: %w", err)
		}
	}
	for _, ac := range b.Activities {
		if err := q.ImportActivities(ctx, gen.ImportActivitiesParams{ID: ac.ID, ResourceType: ac.ResourceType, ResourceID: ac.ResourceID, Action: ac.Action, Data: ac.Data, CreatedAt: ac.CreatedAt, Actor: ac.Actor}); err != nil {
			return fmt.Errorf("导入活动失败: %w", err)
		}
	}
	for _, tl := range b.TaskLabels {
		if err := q.ImportTaskLabels(ctx, gen.ImportTaskLabelsParams{TaskID: tl.TaskID, LabelID: tl.LabelID}); err != nil {
			return fmt.Errorf("导入任务标签关联失败: %w", err)
		}
	}
	for _, tm := range b.TaskMilestones {
		if err := q.ImportTaskMilestones(ctx, gen.ImportTaskMilestonesParams{TaskID: tm.TaskID, MilestoneID: tm.MilestoneID}); err != nil {
			return fmt.Errorf("导入任务里程碑关联失败: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交导入事务失败: %w", err)
	}
	// 导入是全局性变更：广播工作区级事件，通知各端重新拉取数据。
	s.broadcastEvent(Event{Action: EventBackupImported})
	return nil
}

// orEmpty 把 nil 切片归一为空切片（JSON 序列化为 [] 而非 null）。
func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
