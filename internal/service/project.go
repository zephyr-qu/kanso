package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// defaultColumns 是创建项目时自动种子的默认列：待办 / 进行中 / 已阻塞 / 已完成。
// 已完成列置于末列，与仪表盘"完成 = 末列（position 最大）"口径一致（2026-08 调整）。
var defaultColumns = []string{"待办", "进行中", "已阻塞", "已完成"}

const defaultProjectName = "默认项目"

// ListProjects 返回工作区下的项目（按 position、创建时间排序）。
// ProjectSummary 是项目列表条目 + 看板统计（列数 / 任务数 / 进行中列任务数）。
// 内嵌 gen.Project 使 JSON 展平为平铺字段（前端 Project 类型加可选字段即可兼容）。
type ProjectSummary struct {
	gen.Project
	ColumnCount     int64 `json:"columnCount"`
	TaskCount       int64 `json:"taskCount"`
	InProgressCount int64 `json:"inProgressCount"`
}

// sqlc emits distinct row types for projections that intentionally omit the
// storage-only pinned field. Keep that persistence detail out of the service
// API by normalizing those rows at the boundary.
func projectFromListRow(row gen.ListProjectsByWorkspaceRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromArchivedListRow(row gen.ListArchivedProjectsByWorkspaceRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromCreateRow(row gen.CreateProjectRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromUpdateRow(row gen.UpdateProjectNameRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromGetRow(row gen.GetProjectRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromArchiveRow(row gen.ArchiveProjectRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

func projectFromBackupRow(row gen.ListAllProjectsRow) gen.Project {
	return gen.Project{ID: row.ID, WorkspaceID: row.WorkspaceID, Name: row.Name, Position: row.Position, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, ArchivedAt: row.ArchivedAt}
}

// requireProjectWritable 在项目已归档时返回 ErrProjectArchived。
func requireProjectWritable(project gen.Project) error {
	if project.ArchivedAt != nil {
		return ErrProjectArchived
	}
	return nil
}

// requireProjectWritableByID 查询项目并校验可写；不存在时返回 ErrNotFound。
func (s *Service) requireProjectWritableByID(ctx context.Context, q *gen.Queries, projectID string) (gen.Project, error) {
	row, err := q.GetProject(ctx, projectID)
	if err != nil {
		return gen.Project{}, mapNoRows(err)
	}
	project := projectFromGetRow(row)
	if err := requireProjectWritable(project); err != nil {
		return gen.Project{}, err
	}
	return project, nil
}

// listProjectStatsSQL 一次聚合工作区下全部项目的统计（避免 N+1）。
// "进行中"按列位置口径（0006 Phase 3 任务 3.3）：不在首列也不在末列；
// 与前端/Mock 一致（此前按列名 '进行中' 匹配，列改名后统计失真）。
const listProjectStatsSQL = `
SELECT
  p.id AS project_id,
  COUNT(DISTINCT c.id) AS column_count,
  COUNT(DISTINCT CASE WHEN t.archived_at IS NULL THEN t.id END) AS task_count,
  COUNT(DISTINCT CASE WHEN c.position > pc.min_pos AND c.position < pc.max_pos AND t.archived_at IS NULL THEN t.id END) AS in_progress_count
FROM project p
LEFT JOIN column c ON c.project_id = p.id
LEFT JOIN task t ON t.column_id = c.id AND t.project_id = p.id
LEFT JOIN (
  SELECT project_id, MIN(position) AS min_pos, MAX(position) AS max_pos
  FROM column GROUP BY project_id
) pc ON pc.project_id = p.id
WHERE p.workspace_id = ?
GROUP BY p.id
`

// ListProjects 返回工作区下的项目（按 position、创建时间排序），附带各项目看板统计。
func (s *Service) ListProjects(ctx context.Context, workspaceID string) ([]ProjectSummary, error) {
	q := gen.New(s.db)
	projects, err := q.ListProjectsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	// 空列表返回 [] 而非 null，保证前端合约一致。
	if projects == nil {
		return []ProjectSummary{}, nil
	}

	stats := make(map[string][3]int64, len(projects))
	rows, err := s.db.QueryContext(ctx, listProjectStatsSQL, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询项目统计失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var projectID string
		var columnCount, taskCount, inProgressCount int64
		if err := rows.Scan(&projectID, &columnCount, &taskCount, &inProgressCount); err != nil {
			return nil, fmt.Errorf("扫描项目统计失败: %w", err)
		}
		stats[projectID] = [3]int64{columnCount, taskCount, inProgressCount}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历项目统计失败: %w", err)
	}

	summaries := make([]ProjectSummary, 0, len(projects))
	for _, p := range projects {
		st := stats[p.ID]
		summaries = append(summaries, ProjectSummary{
			Project:         projectFromListRow(p),
			ColumnCount:     st[0],
			TaskCount:       st[1],
			InProgressCount: st[2],
		})
	}
	return summaries, nil
}

// ListArchivedProjects 返回工作区下已归档项目（按归档时间倒序），附带看板统计。
func (s *Service) ListArchivedProjects(ctx context.Context, workspaceID string) ([]ProjectSummary, error) {
	q := gen.New(s.db)
	projects, err := q.ListArchivedProjectsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if projects == nil {
		return []ProjectSummary{}, nil
	}

	stats := make(map[string][3]int64, len(projects))
	rows, err := s.db.QueryContext(ctx, listProjectStatsSQL, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询项目统计失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var projectID string
		var columnCount, taskCount, inProgressCount int64
		if err := rows.Scan(&projectID, &columnCount, &taskCount, &inProgressCount); err != nil {
			return nil, fmt.Errorf("扫描项目统计失败: %w", err)
		}
		stats[projectID] = [3]int64{columnCount, taskCount, inProgressCount}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历项目统计失败: %w", err)
	}

	summaries := make([]ProjectSummary, 0, len(projects))
	for _, p := range projects {
		st := stats[p.ID]
		summaries = append(summaries, ProjectSummary{
			Project:         projectFromArchivedListRow(p),
			ColumnCount:     st[0],
			TaskCount:       st[1],
			InProgressCount: st[2],
		})
	}
	return summaries, nil
}

// PinnedProject 是当前工作区侧边栏"置顶"分组的项目条目。
type PinnedProject struct {
	ProjectID   string `json:"projectId"`
	WorkspaceID string `json:"workspaceId"`
	Name        string `json:"name"`
}

// listPinnedProjectsSQL 列出当前工作区置顶项目，最近创建的在前。
const listPinnedProjectsSQL = `
SELECT p.id, p.workspace_id, p.name
FROM project p
WHERE p.pinned = 1 AND p.workspace_id = ? AND p.archived_at IS NULL
ORDER BY p.created_at DESC
`

// setProjectPinnedSQL 更新项目置顶位（0 行 = 项目不存在）。
const setProjectPinnedSQL = `UPDATE project SET pinned = ? WHERE id = ?`

// ListPinnedProjects 返回全部置顶项目（跨工作区）。
func (s *Service) ListPinnedProjects(ctx context.Context, workspaceID string) ([]PinnedProject, error) {
	rows, err := s.db.QueryContext(ctx, listPinnedProjectsSQL, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询置顶项目失败: %w", err)
	}
	defer rows.Close()
	result := []PinnedProject{}
	for rows.Next() {
		var p PinnedProject
		if err := rows.Scan(&p.ProjectID, &p.WorkspaceID, &p.Name); err != nil {
			return nil, fmt.Errorf("扫描置顶项目失败: %w", err)
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历置顶项目失败: %w", err)
	}
	return result, nil
}

// SetProjectPinned 设置/取消项目置顶；项目不存在时返回 ErrNotFound。
func (s *Service) SetProjectPinned(ctx context.Context, projectID string, pinned bool) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	project, err := q.GetProject(ctx, projectID)
	if err != nil {
		return mapNoRows(err)
	}
	if err := requireProjectWritable(projectFromGetRow(project)); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, setProjectPinnedSQL, pinned, projectID)
	if err != nil {
		return fmt.Errorf("更新置顶失败: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("读取影响行失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	action := EventProjectUnpinned
	if pinned {
		action = EventProjectPinned
	}
	return s.commitEvents(ctx, tx, q, Event{Action: action, ProjectID: project.ID, WorkspaceID: project.WorkspaceID, EntityID: project.ID, Data: map[string]string{"name": project.Name}, RecordActivity: true})
}

// createProjectInTx 创建项目并种子固定看板默认列；调用方负责事务和事件提交。
func createProjectInTx(ctx context.Context, q *gen.Queries, workspaceID, name string) (gen.Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	projectID, err := id.New()
	if err != nil {
		return gen.Project{}, err
	}
	projectRow, err := q.CreateProject(ctx, gen.CreateProjectParams{
		ID:          projectID,
		WorkspaceID: workspaceID,
		Name:        name,
		Position:    0,
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		return gen.Project{}, fmt.Errorf("创建项目失败: %w", err)
	}
	project := projectFromCreateRow(projectRow)
	for i, columnName := range defaultColumns {
		columnID, err := id.New()
		if err != nil {
			return gen.Project{}, err
		}
		if _, err := q.CreateColumn(ctx, gen.CreateColumnParams{
			ID:        columnID,
			ProjectID: projectID,
			Name:      columnName,
			Position:  int64(i),
			CreatedAt: now,
		}); err != nil {
			return gen.Project{}, fmt.Errorf("种子默认列 %q 失败: %w", columnName, err)
		}
	}
	return project, nil
}

// CreateProject 创建项目并在同一事务内种子固定看板默认列（0008：模板已移除）。
func (s *Service) CreateProject(ctx context.Context, workspaceID, name string) (gen.Project, error) {
	if name == "" {
		return gen.Project{}, invalidInput("项目名称不能为空")
	}
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Project{}, err
	}
	defer func() { _ = tx.Rollback() }()

	project, err := createProjectInTx(ctx, q, workspaceID, name)
	if err != nil {
		return gen.Project{}, err
	}

	if err := s.commitEvents(ctx, tx, q, Event{Action: EventProjectCreated, ProjectID: project.ID, WorkspaceID: project.WorkspaceID, EntityID: project.ID, Data: map[string]string{"name": project.Name}, RecordActivity: true}); err != nil {
		return gen.Project{}, err
	}
	return project, nil
}

// RenameProject 重命名项目；不存在时返回 ErrNotFound。
func (s *Service) RenameProject(ctx context.Context, projectID, name string) (gen.Project, error) {
	if name == "" {
		return gen.Project{}, invalidInput("项目名称不能为空")
	}
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Project{}, err
	}
	defer func() { _ = tx.Rollback() }()

	projectRow, err := q.UpdateProjectName(ctx, gen.UpdateProjectNameParams{
		ID:        projectID,
		Name:      name,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Project{}, mapNoRows(err)
	}
	project := projectFromUpdateRow(projectRow)
	if err := s.commitEvents(ctx, tx, q, Event{Action: EventProjectUpdated, ProjectID: project.ID, WorkspaceID: project.WorkspaceID, EntityID: project.ID, Data: map[string]string{"name": project.Name}, RecordActivity: true}); err != nil {
		return gen.Project{}, err
	}
	return project, nil
}

// SetProjectArchived 归档或恢复项目。
// 归档前要求无未完成活跃任务（未归档且不在末列）；归档时自动取消置顶。
func (s *Service) SetProjectArchived(ctx context.Context, projectID string, archived bool) (gen.Project, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return gen.Project{}, err
	}
	defer func() { _ = tx.Rollback() }()

	currentRow, err := q.GetProject(ctx, projectID)
	if err != nil {
		return gen.Project{}, mapNoRows(err)
	}
	current := projectFromGetRow(currentRow)
	if (current.ArchivedAt != nil) == archived {
		return current, nil
	}

	updatedAt := time.Now().UTC().Format(time.RFC3339)
	var archivedAt *string
	action := EventProjectRestored
	if archived {
		incomplete, err := q.CountIncompleteActiveTasks(ctx, projectID)
		if err != nil {
			return gen.Project{}, fmt.Errorf("检查未完成任务失败: %w", err)
		}
		if incomplete > 0 {
			return gen.Project{}, ErrProjectHasIncompleteTasks
		}
		archivedAt = &updatedAt
		action = EventProjectArchived
	}

	row, err := q.ArchiveProject(ctx, gen.ArchiveProjectParams{
		ArchivedAt: archivedAt,
		UpdatedAt:  updatedAt,
		ID:         projectID,
	})
	if err != nil {
		return gen.Project{}, mapNoRows(err)
	}
	project := projectFromArchiveRow(row)
	if err := s.commitEvents(ctx, tx, q, Event{
		Action:         action,
		ProjectID:      project.ID,
		WorkspaceID:    project.WorkspaceID,
		EntityID:       project.ID,
		Data:           map[string]any{"archivedAt": archivedAt, "name": project.Name},
		RecordActivity: true,
	}); err != nil {
		return gen.Project{}, err
	}
	return project, nil
}

// DeleteProject 删除项目，其下列/任务/评论/活动由外键级联删除；不存在时返回 ErrNotFound。
func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	project, err := q.GetProject(ctx, projectID)
	if err != nil {
		return mapNoRows(err)
	}
	// 先清项目下任务的活动（activity 无外键，需显式清理）。
	if err := q.DeleteActivitiesByProject(ctx, &projectID); err != nil {
		return fmt.Errorf("删除项目活动失败: %w", err)
	}
	n, err := q.DeleteProject(ctx, projectID)
	if err != nil {
		return fmt.Errorf("删除项目失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return s.commitEvents(ctx, tx, q, Event{Action: EventProjectDeleted, ProjectID: projectID, WorkspaceID: project.WorkspaceID, EntityID: projectID, Data: map[string]string{"name": project.Name}, RecordActivity: true})
}
