package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// defaultWorkspaceName 是首启自动种子的默认工作区名。
const defaultWorkspaceName = "默认工作区"

// SeedDefaultWorkspace 在库中没有任何工作区时创建默认工作区（首启自动种子，见 ADR-0002）。
// 时间戳遵循 schema 约定：RFC3339 UTC，由应用层写入。
func (s *Service) SeedDefaultWorkspace(ctx context.Context) error {
	q := gen.New(s.db)

	count, err := q.CountWorkspaces(ctx)
	if err != nil {
		return fmt.Errorf("统计工作区失败: %w", err)
	}
	if count > 0 {
		return nil
	}

	workspaceID, err := id.New()
	if err != nil {
		return err
	}
	if _, err := q.CreateWorkspace(ctx, gen.CreateWorkspaceParams{
		ID:        workspaceID,
		Name:      defaultWorkspaceName,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		return fmt.Errorf("创建默认工作区失败: %w", err)
	}
	return nil
}

// ListWorkspaces 返回全部工作区（单用户场景通常只有一个）。
func (s *Service) ListWorkspaces(ctx context.Context) ([]gen.Workspace, error) {
	workspaces, err := gen.New(s.db).ListWorkspaces(ctx)
	if err != nil {
		return nil, err
	}
	if workspaces == nil {
		return []gen.Workspace{}, nil
	}
	return workspaces, nil
}

// CreateWorkspace 创建新工作区。
func (s *Service) CreateWorkspace(ctx context.Context, name string) (gen.Workspace, error) {
	workspaceID, err := id.New()
	if err != nil {
		return gen.Workspace{}, err
	}
	workspace, err := gen.New(s.db).CreateWorkspace(ctx, gen.CreateWorkspaceParams{
		ID:        workspaceID,
		Name:      name,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return gen.Workspace{}, err
	}
	if err := s.dispatch(ctx, Event{Action: EventWorkspaceCreated, WorkspaceID: workspace.ID, EntityID: workspace.ID, Data: map[string]string{"name": workspace.Name}, RecordActivity: true}); err != nil {
		return gen.Workspace{}, err
	}
	return workspace, nil
}

// RenameWorkspace 重命名工作区；不存在时返回 ErrNotFound。
func (s *Service) RenameWorkspace(ctx context.Context, workspaceID, name string) (gen.Workspace, error) {
	workspace, err := gen.New(s.db).UpdateWorkspaceName(ctx, gen.UpdateWorkspaceNameParams{
		ID:   workspaceID,
		Name: name,
	})
	if err != nil {
		return gen.Workspace{}, mapNoRows(err)
	}
	if err := s.dispatch(ctx, Event{Action: EventWorkspaceUpdated, WorkspaceID: workspace.ID, EntityID: workspace.ID, Data: map[string]string{"name": workspace.Name}, RecordActivity: true}); err != nil {
		return gen.Workspace{}, err
	}
	return workspace, nil
}

// ErrLastWorkspace 表示试图删除最后一个工作区（HTTP 层映射为 400）。
// 工作区承载 owner 成员（member.workspace_id 级联删除），删光会导致认证身份失效。
var ErrLastWorkspace = errors.New("cannot delete last workspace")

// DeleteWorkspace 删除工作区，其下项目/列/任务等由外键级联删除；不存在时返回 ErrNotFound。
// 最后一个工作区不可删除（个人/团队模式均适用：owner 成员随工作区级联删除）。
func (s *Service) DeleteWorkspace(ctx context.Context, workspaceID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	// 目标不存在 → ErrNotFound（先于「最后一个」守卫，避免对不存在的工作区误报）。
	workspace, err := q.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return mapNoRows(err)
	}
	count, err := q.CountWorkspaces(ctx)
	if err != nil {
		return fmt.Errorf("统计工作区失败: %w", err)
	}
	if count <= 1 {
		return ErrLastWorkspace
	}
	// 先清工作区下任务的活动（activity 无外键，需显式清理）。
	if err := q.DeleteActivitiesByWorkspace(ctx, &workspaceID); err != nil {
		return fmt.Errorf("删除工作区活动失败: %w", err)
	}
	n, err := q.DeleteWorkspace(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("删除工作区失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交删除工作区事务失败: %w", err)
	}
	return s.dispatch(ctx, Event{Action: EventWorkspaceDeleted, WorkspaceID: workspaceID, EntityID: workspaceID, Data: map[string]string{"name": workspace.Name}, RecordActivity: true})
}
