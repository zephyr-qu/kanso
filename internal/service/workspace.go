package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// SeedDefaultWorkspace 在库中没有任何工作区时创建默认工作区（首启自动种子，见 ADR-0002）。
// 时间戳遵循 schema 约定：RFC3339 UTC，由应用层写入。
func SeedDefaultWorkspace(database *sql.DB) error {
	q := gen.New(database)

	count, err := q.CountWorkspaces(context.Background())
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
	if _, err := q.CreateWorkspace(context.Background(), gen.CreateWorkspaceParams{
		ID:        workspaceID,
		Name:      "默认工作区",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		return fmt.Errorf("创建默认工作区失败: %w", err)
	}
	return nil
}
