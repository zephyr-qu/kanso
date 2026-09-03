package service

import (
	"context"
	"database/sql"
	"fmt"

	"kanso/internal/db/gen"
)

const workspaceAccessPredicate = `
	EXISTS (SELECT 1 FROM member m WHERE m.id = ? AND m.role = 'admin')
	OR EXISTS (SELECT 1 FROM workspace_member wm WHERE wm.workspace_id = w.id AND wm.member_id = ?)
`

const listAccessibleWorkspacesSQL = `
	SELECT w.id, w.name, w.created_at
	FROM workspace w
	WHERE ` + workspaceAccessPredicate + `
	ORDER BY w.created_at
`

// MaxMembers is the instance seat limit. Admins and members both consume one
// identity seat; memberships do not consume additional seats.
const MaxMembers = 6

// MaxAdmins is the instance-wide administrator limit. Administrator status is
// global, so this limit applies across all workspaces.
const MaxAdmins = 2

// RequireInstanceAdmin is the single authorization seam for instance-level
// governance. It deliberately does not inspect the current workspace.
func (s *Service) RequireInstanceAdmin(ctx context.Context, memberID string) error {
	if role, ok := MemberRoleFromContext(ctx); ok {
		if role != memberRoleAdmin {
			return ErrForbidden
		}
		return nil
	}
	var role string
	if err := s.db.QueryRowContext(ctx, `SELECT role FROM member WHERE id = ?`, memberID).Scan(&role); err != nil {
		if err == sql.ErrNoRows {
			return ErrNotFound
		}
		return fmt.Errorf("查询成员角色失败: %w", err)
	}
	if role != memberRoleAdmin {
		return ErrForbidden
	}
	return nil
}

// ListAccessibleWorkspaces returns only the workspaces visible to memberID.
func (s *Service) ListAccessibleWorkspaces(ctx context.Context, memberID string) ([]gen.Workspace, error) {
	rows, err := s.db.QueryContext(ctx, listAccessibleWorkspacesSQL, memberID, memberID)
	if err != nil {
		return nil, fmt.Errorf("查询可访问工作区失败: %w", err)
	}
	defer rows.Close()
	result := []gen.Workspace{}
	for rows.Next() {
		var item gen.Workspace
		if err := rows.Scan(&item.ID, &item.Name, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("读取可访问工作区失败: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历可访问工作区失败: %w", err)
	}
	return result, nil
}

// ListWorkspaceMembers returns members explicitly authorized for a workspace.
// Admins are included in the view even though their access is implicit.
func (s *Service) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]Member, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.id, m.name, m.role, m.avatar_color, m.avatar, m.created_at,
		       m.access_key_hash
		FROM member m
		WHERE m.role = 'admin'
		   OR EXISTS (SELECT 1 FROM workspace_member wm WHERE wm.workspace_id = ? AND wm.member_id = m.id)
		ORDER BY m.created_at, m.id`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("查询工作区成员失败: %w", err)
	}
	defer rows.Close()
	result := []Member{}
	for rows.Next() {
		var item Member
		var accessKeyHash *string
		if err := rows.Scan(&item.ID, &item.Name, &item.Role, &item.AvatarColor, &item.Avatar, &item.CreatedAt, &accessKeyHash); err != nil {
			return nil, fmt.Errorf("读取工作区成员失败: %w", err)
		}
		item.HasKey = accessKeyHash != nil && *accessKeyHash != ""
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历工作区成员失败: %w", err)
	}
	return result, nil
}

// AddMemberToWorkspace grants one existing member access to a workspace.
func (s *Service) AddMemberToWorkspace(ctx context.Context, workspaceID, memberID string) error {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace WHERE id = ?)`, workspaceID).Scan(&exists); err != nil {
		return fmt.Errorf("检查工作区失败: %w", err)
	}
	if exists == 0 {
		return ErrNotFound
	}
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM member WHERE id = ?)`, memberID).Scan(&exists); err != nil {
		return fmt.Errorf("检查成员失败: %w", err)
	}
	if exists == 0 {
		return ErrNotFound
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO workspace_member (workspace_id, member_id, created_at) VALUES (?, ?, datetime('now'))`, workspaceID, memberID)
	if err != nil {
		return fmt.Errorf("授权工作区成员失败: %w", err)
	}
	s.emitWorkspace(workspaceID, EventMemberUpdated, memberID)
	return nil
}

// RemoveMemberFromWorkspace revokes one ordinary member's workspace access.
// Admins remain globally authorized and cannot be removed from one workspace.
func (s *Service) RemoveMemberFromWorkspace(ctx context.Context, workspaceID, memberID string) error {
	var role string
	if err := s.db.QueryRowContext(ctx, `SELECT role FROM member WHERE id = ?`, memberID).Scan(&role); err != nil {
		if err == sql.ErrNoRows {
			return ErrNotFound
		}
		return fmt.Errorf("查询成员角色失败: %w", err)
	}
	if role == memberRoleAdmin {
		return ErrForbidden
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_member WHERE workspace_id = ? AND member_id = ?`, workspaceID, memberID)
	if err != nil {
		return fmt.Errorf("移除工作区成员失败: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("读取移除结果失败: %w", err)
	}
	if count == 0 {
		return ErrNotFound
	}
	s.emitWorkspace(workspaceID, EventMemberUpdated, memberID)
	return nil
}
