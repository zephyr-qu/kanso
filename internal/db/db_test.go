// Package db 测试：Open（目录创建/PRAGMA）与 Migrate（迁移幂等/错误路径），真实临时 SQLite。
package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpen(t *testing.T) {
	dir := t.TempDir()
	database, err := Open(dir)
	if err != nil {
		t.Fatalf("Open 失败: %v", err)
	}
	defer database.Close()

	// WAL 生效（Open 的 PRAGMA 设置）。
	var mode string
	if err := database.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("查询 journal_mode 失败: %v", err)
	}
	if mode != "wal" {
		t.Fatalf("journal_mode 应为 wal，实际 %q", mode)
	}
	// 数据文件已创建。
	if _, err := os.Stat(filepath.Join(dir, "kanso.db")); err != nil {
		t.Fatalf("数据库文件未创建: %v", err)
	}
	// 连接数限制生效（单写者）。
	if got := database.Stats().MaxOpenConnections; got != 1 {
		t.Fatalf("MaxOpenConns 应为 1，实际 %d", got)
	}
}

func TestOpenMkdirFail(t *testing.T) {
	// dataDir 是已存在文件 → MkdirAll 失败，覆盖错误分支。
	file := filepath.Join(t.TempDir(), "blocked")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(file); err == nil {
		t.Fatal("dataDir 为文件时应返回错误")
	}
}

func TestOpenSqlOpenFail(t *testing.T) {
	// 替换驱动名为不存在 → sql.Open 失败，覆盖错误分支。
	old := sqliteDriver
	t.Cleanup(func() { sqliteDriver = old })
	sqliteDriver = "nonexistent-driver"

	if _, err := Open(t.TempDir()); err == nil {
		t.Fatal("驱动缺失时 Open 应返回错误")
	}
}

func TestOpenPragmaFail(t *testing.T) {
	// dataDir 中 kanso.db 是目录 → PRAGMA 执行时连接失败，覆盖错误分支。
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "kanso.db"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(dir); err == nil {
		t.Fatal("kanso.db 为目录时 Open 应返回错误")
	}
}

func TestMigrate(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	if err := Migrate(database); err != nil {
		t.Fatalf("Migrate 失败: %v", err)
	}
	var n int
	if err := database.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("迁移未被记录到 schema_migrations")
	}
	if count, err := AppliedMigrationCount(database); err != nil || count != n {
		t.Fatalf("AppliedMigrationCount 应返回 %d，实际 %d，错误 %v", n, count, err)
	}
	// 关键表已建。
	var tbl string
	if err := database.QueryRow(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='workspace'",
	).Scan(&tbl); err != nil {
		t.Fatalf("workspace 表缺失: %v", err)
	}
}

func TestMigrateIdempotent(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	if err := Migrate(database); err != nil {
		t.Fatal(err)
	}
	var n1 int
	if err := database.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&n1); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("二次迁移失败: %v", err)
	}
	var n2 int
	if err := database.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&n2); err != nil {
		t.Fatal(err)
	}
	if n1 != n2 {
		t.Fatalf("重复迁移不应新增记录: %d → %d", n1, n2)
	}
}

func TestMigrateClosedDB(t *testing.T) {
	// 已关闭的库 → 初始 CREATE TABLE 失败，覆盖错误分支。
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	database.Close()
	if err := Migrate(database); err == nil {
		t.Fatal("关闭的库上 Migrate 应返回错误")
	}
}
