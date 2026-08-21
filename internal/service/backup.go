// Backup 导出/导入：全量数据 JSON 快照（导出）+ 全量替换恢复（导入）。
// 前端 settings 页仅下载保存原始 JSON，平铺数组结构即可（mock 嵌套结构不构成契约约束）。
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"kanso/internal/db/gen"
)

const (
	BackupSchema  = "kanso.backup"
	BackupVersion = 1
)

type BackupData struct {
	Schema         string              `json:"schema"`
	Version        int                 `json:"version"`
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

	b := BackupData{
		Schema:     BackupSchema,
		Version:    BackupVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
	}
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
	if err := validateBackup(b); err != nil {
		return err
	}
	// 先把当前数据库导出为独立快照，再执行破坏性全量替换。
	// 生产环境由 app.New 注入 DataDir/backups；写入失败时中止导入，避免无法回滚的人为误操作。
	if err := s.writePreImportSnapshot(ctx); err != nil {
		return err
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
		if err := q.ImportActivities(ctx, gen.ImportActivitiesParams{ID: ac.ID, ResourceType: ac.ResourceType, ResourceID: ac.ResourceID, ProjectID: ac.ProjectID, WorkspaceID: ac.WorkspaceID, Action: ac.Action, Data: ac.Data, CreatedAt: ac.CreatedAt, Actor: ac.Actor}); err != nil {
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

	workspaceID := b.Workspaces[0].ID
	event := Event{Action: EventBackupImported, WorkspaceID: workspaceID, EntityID: workspaceID, RecordActivity: true}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交导入事务失败: %w", err)
	}
	// 导入是全局性变更：广播工作区级事件，通知各端重新拉取数据。
	s.broadcastEvent(event)
	return nil
}

// orEmpty 把 nil 切片归一为空切片（JSON 序列化为 [] 而非 null）。
func orEmpty[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// SetBackupDir 配置导入前安全快照目录。空目录用于不需要落盘快照的嵌入式场景。
func (s *Service) SetBackupDir(dir string) {
	s.backupDir = dir
}

func validateBackup(b BackupData) error {
	// schema/version 为新增字段；缺省值兼容历史备份，非零值必须严格匹配当前格式。
	if b.Schema != "" && b.Schema != BackupSchema {
		return fmt.Errorf("%w: 不支持的 schema %q", ErrInvalidBackup, b.Schema)
	}
	if b.Version != 0 && b.Version != BackupVersion {
		return fmt.Errorf("%w: 不支持的 version %d", ErrInvalidBackup, b.Version)
	}
	if len(b.Workspaces) == 0 {
		return ErrInvalidBackup
	}
	return nil
}

func (s *Service) writePreImportSnapshot(ctx context.Context) error {
	if s.backupDir == "" {
		return nil
	}
	snapshot, err := s.GetBackup(ctx)
	if err != nil {
		return fmt.Errorf("生成导入前快照失败: %w", err)
	}
	body, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("编码导入前快照失败: %w", err)
	}
	if err := os.MkdirAll(s.backupDir, 0o700); err != nil {
		return fmt.Errorf("创建导入前快照目录 %q 失败: %w", s.backupDir, err)
	}
	tmp, err := os.CreateTemp(s.backupDir, ".pre-import-*.json")
	if err != nil {
		return fmt.Errorf("创建导入前快照临时文件失败: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("设置导入前快照权限失败: %w", err)
	}
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("写入导入前快照失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("关闭导入前快照失败: %w", err)
	}
	name := filepath.Join(s.backupDir, "pre-import-"+time.Now().UTC().Format("20060102T150405.000000000Z")+".json")
	if err := os.Rename(tmpName, name); err != nil {
		return fmt.Errorf("保存导入前快照失败: %w", err)
	}
	return nil
}
