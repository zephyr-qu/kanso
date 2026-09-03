package service

import (
	"context"
	"database/sql"
	"fmt"
)

// WorkspaceAdmission is the shared domain seam for entering a workspace or
// one of its resources. HTTP and WebSocket adapters use the same decision so
// they cannot drift into different isolation policies.
type WorkspaceAdmission struct {
	service *Service
}

// ResourceType identifies a resource whose workspace is derived from its owner.
type ResourceType string

const (
	ResourceProject   ResourceType = "project"
	ResourceColumn    ResourceType = "column"
	ResourceTask      ResourceType = "task"
	ResourceLabel     ResourceType = "label"
	ResourceMilestone ResourceType = "milestone"
	ResourceComment   ResourceType = "comment"
)

func NewWorkspaceAdmission(service *Service) *WorkspaceAdmission {
	return &WorkspaceAdmission{service: service}
}

// AdmitWorkspace checks the workspace exists and that the member may enter
// it. Administrators are instance-wide; ordinary members need membership.
func (a *WorkspaceAdmission) AdmitWorkspace(ctx context.Context, memberID, workspaceID string) error {
	if workspaceID == "" {
		return ErrNotFound
	}
	var exists int
	if err := a.service.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM workspace WHERE id = ?)`, workspaceID,
	).Scan(&exists); err != nil {
		return fmt.Errorf("检查工作区失败: %w", err)
	}
	if exists == 0 {
		return ErrNotFound
	}
	// Admin access is instance-wide. Keep the fast path so the resource or
	// workspace handler remains responsible for its normal not-found behavior.
	if role, ok := MemberRoleFromContext(ctx); ok && role == memberRoleAdmin {
		return nil
	}

	if err := a.service.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM workspace w
			WHERE w.id = ? AND (`+workspaceAccessPredicate+`)
		)`, workspaceID, memberID, memberID).Scan(&exists); err != nil {
		return fmt.Errorf("检查工作区访问权限失败: %w", err)
	}
	if exists == 0 {
		return ErrForbidden
	}
	return nil
}

// ResolveResourceWorkspace finds the owning workspace of a project-scoped
// resource. The adapter remains responsible for deciding which path segment
// is a resource; ownership and table joins live here.
func (a *WorkspaceAdmission) ResolveResourceWorkspace(
	ctx context.Context,
	resourceType ResourceType, resourceID string,
) (string, error) {
	query := map[ResourceType]string{
		ResourceProject:   `SELECT workspace_id FROM project WHERE id = ?`,
		ResourceColumn:    `SELECT p.workspace_id FROM column c JOIN project p ON p.id = c.project_id WHERE c.id = ?`,
		ResourceTask:      `SELECT p.workspace_id FROM task t JOIN project p ON p.id = t.project_id WHERE t.id = ?`,
		ResourceLabel:     `SELECT p.workspace_id FROM label l JOIN project p ON p.id = l.project_id WHERE l.id = ?`,
		ResourceMilestone: `SELECT p.workspace_id FROM milestone m JOIN project p ON p.id = m.project_id WHERE m.id = ?`,
		ResourceComment:   `SELECT p.workspace_id FROM comment c JOIN task t ON t.id = c.task_id JOIN project p ON p.id = t.project_id WHERE c.id = ?`,
	}[resourceType]
	if query == "" || resourceID == "" {
		return "", ErrNotFound
	}

	var workspaceID string
	if err := a.service.db.QueryRowContext(ctx, query, resourceID).Scan(&workspaceID); err != nil {
		if err == sql.ErrNoRows {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("解析资源工作区失败: %w", err)
	}
	return workspaceID, nil
}

// AdmitResource resolves ownership and then applies the workspace policy.
func (a *WorkspaceAdmission) AdmitResource(
	ctx context.Context,
	memberID string, resourceType ResourceType, resourceID string,
) error {
	// Admin access is instance-wide; the downstream handler owns resource
	// existence and validation just as it did before the shared seam existed.
	if role, ok := MemberRoleFromContext(ctx); ok && role == memberRoleAdmin {
		return nil
	}
	workspaceID, err := a.ResolveResourceWorkspace(ctx, resourceType, resourceID)
	if err != nil {
		return err
	}
	return a.AdmitWorkspace(ctx, memberID, workspaceID)
}
