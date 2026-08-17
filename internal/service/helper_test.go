// 纯函数 helper 单元测试：趋势构建、列表操作、错误映射、reindex 失败分支。
package service

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"kanso/internal/db/gen"
)

func TestMapNoRows(t *testing.T) {
	if err := mapNoRows(sql.ErrNoRows); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ErrNoRows 应映射为 ErrNotFound，实际 %v", err)
	}
	sentinel := errors.New("其他错误")
	if got := mapNoRows(sentinel); got != sentinel {
		t.Fatalf("其他错误应原样返回，实际 %v", got)
	}
	if got := mapNoRows(nil); got != nil {
		t.Fatalf("nil 应返回 nil，实际 %v", got)
	}
}

func TestBuildDashboardTrend(t *testing.T) {
	now := time.Now().UTC()
	today := now.Format("2006-01-02")
	created := []gen.ListTaskCreationTrendRow{
		{Day: today, Count: 2},
	}
	completed := []gen.ListTaskCompletionTrendRow{
		{Day: today, Count: 1},
	}
	direct := []gen.ListTaskCreatedInFinalColumnTrendRow{
		{Day: today, Count: 3},
	}
	points := buildDashboardTrend(created, completed, direct, 5)
	if len(points) != 5 {
		t.Fatalf("应返回 5 个点，实际 %d", len(points))
	}
	// 末位是今天（i=0），往前推。找到有数据的日。
	found := false
	for _, p := range points {
		if p.Created == 2 && p.Completed == 4 { // 1 + 3 合并
			found = true
		}
	}
	if !found {
		t.Fatalf("趋势未合并 completed+direct: %+v", points)
	}
	// days=0 → 空。
	if points0 := buildDashboardTrend(nil, nil, nil, 0); len(points0) != 0 {
		t.Fatalf("days=0 应返回空，实际 %d", len(points0))
	}
}

func TestRemoveInsertTask(t *testing.T) {
	mk := func(ids ...string) []gen.Task {
		out := make([]gen.Task, 0, len(ids))
		for _, id := range ids {
			out = append(out, gen.Task{ID: id})
		}
		return out
	}
	tasks := mk("a", "b", "c")

	// removeTask：移除中间/末尾/不存在。
	got := removeTask(tasks, "b")
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "c" {
		t.Fatalf("removeTask 不符: %v", got)
	}
	if got := removeTask(tasks, "nope"); len(got) != 3 {
		t.Fatalf("移除不存在应原样: %v", got)
	}

	// insertTask：开头/中间/负数 clamp/越界 clamp。
	if got := insertTask(tasks, gen.Task{ID: "x"}, 0); len(got) != 4 || got[0].ID != "x" {
		t.Fatalf("insertTask 开头不符: %v", got)
	}
	if got := insertTask(tasks, gen.Task{ID: "x"}, 1); got[1].ID != "x" {
		t.Fatalf("insertTask 中间不符: %v", got)
	}
	if got := insertTask(tasks, gen.Task{ID: "x"}, -5); got[0].ID != "x" {
		t.Fatalf("insertTask 负数应 clamp 到开头: %v", got)
	}
	if got := insertTask(tasks, gen.Task{ID: "x"}, 99); got[3].ID != "x" {
		t.Fatalf("insertTask 越界应 clamp 到末尾: %v", got)
	}
}

func TestReindexTasksError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	mock.ExpectExec("SetTaskPosition").
		WillReturnError(errors.New("更新位置失败"))

	q := gen.New(db)
	err = reindexTasks(context.Background(), q, []gen.Task{{ID: "t1"}}, "c1", time.Now().UTC().Format(time.RFC3339))
	if err == nil {
		t.Fatal("SetTaskPosition 失败时应返回错误")
	}
}

func TestNullableHelpers(t *testing.T) {
	if nullableString("") != nil {
		t.Fatal("空串应为 nil")
	}
	if v := nullableString("x"); v == nil || *v != "x" {
		t.Fatal("非空串应返回指针")
	}
	if nullableDueDate(nil) != nil {
		t.Fatal("nil 日期应为 nil")
	}
	empty := ""
	if nullableDueDate(&empty) != nil {
		t.Fatal("空串日期应为 nil")
	}
	val := "2026-09-01"
	if v := nullableDueDate(&val); v == nil || *v != "2026-09-01" {
		t.Fatal("非空日期应返回指针")
	}
}
