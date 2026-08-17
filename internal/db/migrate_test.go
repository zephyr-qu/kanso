// Package db 测试：Migrate 的错误分支（查询/扫描/事务/读取失败）。
// 正常迁移路径由 db_test.go 用真实 SQLite 覆盖；此处错误分支用 sqlmock（数据库边界 mock）
// 与注入的假 FS（fs.FS 边界）覆盖——真实测试库无法触发的防御分支。
package db

import (
	"database/sql"
	"errors"
	"io/fs"
	"testing"
	"testing/fstest"

	"github.com/DATA-DOG/go-sqlmock"
)

// fakeMigrationFS 返回单一简单迁移，控制 tx.Exec 的 SQL 内容。
func fakeMigrationFS() fs.FS {
	return fstest.MapFS{
		"migrations/0001-test.sql": &fstest.MapFile{Data: []byte("CREATE TABLE t (id TEXT);")},
	}
}

// useFakeFS 替换 migrateFS 为假 FS，测试结束恢复。
func useFakeFS(t *testing.T) {
	t.Helper()
	old := migrateFS
	t.Cleanup(func() { migrateFS = old })
	migrateFS = fakeMigrationFS()
}

// newMock 创建 sqlmock（含假迁移 FS），不预置期望，由各测试自行安排。
func newMock(t *testing.T) (sqlmock.Sqlmock, *sql.DB) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock 创建失败: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("未满足的 sqlmock 期望: %v", err)
		}
	})
	useFakeFS(t)
	return mock, db
}

// expectBase 预置 CREATE TABLE + SELECT version 两个成功期望。
func expectBase(mock sqlmock.Sqlmock) {
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT version FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version"}))
}

func TestMigrateQueryError(t *testing.T) {
	mock, db := newMock(t)
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT version FROM schema_migrations").
		WillReturnError(errors.New("查询失败"))

	if err := Migrate(db); err == nil {
		t.Fatal("查询已应用迁移失败时应返回错误")
	}
}

func TestMigrateScanError(t *testing.T) {
	mock, db := newMock(t)
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS schema_migrations").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT version FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"version"}).
			AddRow("0001").RowError(0, errors.New("扫描失败")))

	if err := Migrate(db); err == nil {
		t.Fatal("扫描已应用迁移失败时应返回错误")
	}
}

func TestMigrateBeginError(t *testing.T) {
	mock, db := newMock(t)
	expectBase(mock)
	mock.ExpectBegin().WillReturnError(errors.New("开启事务失败"))

	if err := Migrate(db); err == nil {
		t.Fatal("Begin 失败时应返回错误")
	}
}

func TestMigrateExecError(t *testing.T) {
	mock, db := newMock(t)
	expectBase(mock)
	mock.ExpectBegin()
	mock.ExpectExec("CREATE TABLE t").WillReturnError(errors.New("迁移 SQL 执行失败"))
	mock.ExpectRollback()

	if err := Migrate(db); err == nil {
		t.Fatal("迁移 SQL 执行失败时应返回错误")
	}
}

func TestMigrateInsertError(t *testing.T) {
	mock, db := newMock(t)
	expectBase(mock)
	mock.ExpectBegin()
	mock.ExpectExec("CREATE TABLE t").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO schema_migrations").WillReturnError(errors.New("记录迁移失败"))
	mock.ExpectRollback()

	if err := Migrate(db); err == nil {
		t.Fatal("记录迁移版本失败时应返回错误")
	}
}

func TestMigrateCommitError(t *testing.T) {
	mock, db := newMock(t)
	expectBase(mock)
	mock.ExpectBegin()
	mock.ExpectExec("CREATE TABLE t").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO schema_migrations").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit().WillReturnError(errors.New("提交失败"))

	if err := Migrate(db); err == nil {
		t.Fatal("Commit 失败时应返回错误")
	}
}

func TestMigrateReadDirError(t *testing.T) {
	old := migrateFS
	t.Cleanup(func() { migrateFS = old })
	migrateFS = brokenFS{}

	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(db); err == nil {
		t.Fatal("读取迁移目录失败时应返回错误")
	}
}

func TestMigrateReadFileError(t *testing.T) {
	old := migrateFS
	t.Cleanup(func() { migrateFS = old })
	// 目录可列出 0001.sql，但读取具体文件失败 → 覆盖 fs.ReadFile 错误分支。
	migrateFS = fileReadFailFS{}

	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(db); err == nil {
		t.Fatal("读取迁移文件失败时应返回错误")
	}
}

// brokenFS 让 fs.ReadDir 失败。
type brokenFS struct{}

func (brokenFS) Open(string) (fs.File, error) {
	return nil, errors.New("文件系统故障")
}

// fileReadFailFS：migrations 目录可列出条目，但读取具体文件失败。
type fileReadFailFS struct{}

func (fileReadFailFS) Open(name string) (fs.File, error) {
	if name == "migrations" {
		return fakeDir{}, nil
	}
	return nil, errors.New("文件读取故障")
}

// fakeDir 实现 fs.ReadDirFile：列出单个条目 0001.sql。
type fakeDir struct{}

func (fakeDir) Stat() (fs.FileInfo, error) { return nil, errors.New("stat 失败") }
func (fakeDir) Read([]byte) (int, error)   { return 0, errors.New("read 失败") }
func (fakeDir) Close() error               { return nil }
func (fakeDir) ReadDir(int) ([]fs.DirEntry, error) {
	return []fs.DirEntry{fakeDirEntry{}}, nil
}

type fakeDirEntry struct{}

func (fakeDirEntry) Name() string      { return "0001.sql" }
func (fakeDirEntry) IsDir() bool       { return false }
func (fakeDirEntry) Type() fs.FileMode { return 0 }
func (fakeDirEntry) Info() (fs.FileInfo, error) {
	return nil, errors.New("info 失败")
}
