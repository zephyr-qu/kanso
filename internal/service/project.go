package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// defaultColumns 是创建项目时自动种子的默认列（与 kaneo 参考一致）。
var defaultColumns = []string{"待办", "进行中", "已完成"}

// ListProjects 返回工作区下的项目（按 position、创建时间排序）。
func (s *Service) ListProjects(ctx context.Context, workspaceID string) ([]gen.Project, error) {
	projects, err := gen.New(s.db).ListProjectsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	// 空列表返回 [] 而非 null，保证前端合约一致。
	if projects == nil {
		return []gen.Project{}, nil
	}
	return projects, nil
}

// CreateProject 创建项目并在同一事务内种子默认列（见 spec：建项目自动带待办/进行中/已完成）。
func (s *Service) CreateProject(ctx context.Context, workspaceID, name string) (gen.Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return gen.Project{}, fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	q := gen.New(tx)
	now := time.Now().UTC().Format(time.RFC3339)

	projectID, err := id.New()
	if err != nil {
		return gen.Project{}, err
	}
	project, err := q.CreateProject(ctx, gen.CreateProjectParams{
		ID:          projectID,
		WorkspaceID: workspaceID,
		Name:        name,
		Position:    0,
		CreatedAt:   now,
	})
	if err != nil {
		return gen.Project{}, fmt.Errorf("创建项目失败: %w", err)
	}

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

	if err := tx.Commit(); err != nil {
		return gen.Project{}, fmt.Errorf("提交事务失败: %w", err)
	}
	return project, nil
}

// RenameProject 重命名项目；不存在时返回 ErrNotFound。
func (s *Service) RenameProject(ctx context.Context, projectID, name string) (gen.Project, error) {
	project, err := gen.New(s.db).UpdateProjectName(ctx, gen.UpdateProjectNameParams{
		ID:   projectID,
		Name: name,
	})
	if err != nil {
		return gen.Project{}, mapNoRows(err)
	}
	return project, nil
}

// DeleteProject 删除项目，其下列/任务/评论/活动由外键级联删除；不存在时返回 ErrNotFound。
func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	q := gen.New(s.db)
	// 先清项目下任务的活动（activity 无外键，需显式清理）。
	if err := q.DeleteActivitiesByProject(ctx, projectID); err != nil {
		return fmt.Errorf("删除项目活动失败: %w", err)
	}
	n, err := q.DeleteProject(ctx, projectID)
	if err != nil {
		return fmt.Errorf("删除项目失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
