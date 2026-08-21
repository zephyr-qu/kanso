package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
)

// migrateFS 抽象迁移文件源以便测试覆盖读取失败分支（生产为 embed 的 migrationFiles）。
var migrateFS fs.FS = migrationFiles

// AppliedMigrationCount 返回当前数据库已应用的迁移数量，供启动日志使用。
func AppliedMigrationCount(database *sql.DB) (int, error) {
	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&count); err != nil {
		return 0, fmt.Errorf("查询已应用迁移数量失败: %w", err)
	}
	return count, nil
}

// Migrate 按文件名顺序执行未应用的迁移（embed 自 migrations/ 目录）。
// 所有迁移（含 0007 member 表）在 personal/team 两种模式均应用：
// personal = 单一 owner 成员的团队模式（ADR-0013 修订）。
func Migrate(database *sql.DB) error {
	if _, err := database.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return fmt.Errorf("创建迁移记录表失败: %w", err)
	}

	applied := map[string]bool{}
	rows, err := database.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("查询已应用迁移失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("读取已应用迁移版本失败: %w", err)
		}
		applied[version] = true
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("遍历已应用迁移失败: %w", err)
	}

	entries, err := fs.ReadDir(migrateFS, "migrations")
	if err != nil {
		return fmt.Errorf("读取迁移目录失败: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		if applied[name] {
			continue
		}
		content, err := fs.ReadFile(migrateFS, "migrations/"+name)
		if err != nil {
			return fmt.Errorf("读取迁移文件 %q 失败: %w", name, err)
		}
		tx, err := database.Begin()
		if err != nil {
			return fmt.Errorf("开始迁移 %q 事务失败: %w", name, err)
		}
		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("执行迁移 %s 失败: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, name); err != nil {
			tx.Rollback()
			return fmt.Errorf("记录迁移 %q 版本失败: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("提交迁移 %q 失败: %w", name, err)
		}
	}
	return nil
}
