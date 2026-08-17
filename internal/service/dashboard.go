// Dashboard 聚合：对齐前端 lib/dashboard.ts 的 DashboardData 契约（mock 已定义，后端照实现）。
// 批量聚合查询（queries/dashboard.sql），无逐项目 N+1。
package service

import (
	"context"
	"fmt"
	"time"

	"kanso/internal/db/gen"
)

type DashboardColumnStat struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type DashboardPriorityStat struct {
	Priority string `json:"priority"`
	Count    int64  `json:"count"`
}

type DashboardProjectStat struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	WorkspaceID string `json:"workspaceId"`
	Done        int64  `json:"done"`
	Total       int64  `json:"total"`
}

type DashboardFocusTask struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Column      string  `json:"column"`
	ProjectName string  `json:"projectName"`
	DueDate     *string `json:"dueDate"`
	Urgent      bool    `json:"urgent"`
}

// 仪表盘「最近活动」复用 ActivityItem（S-11：删除字段重复的 DashboardActivityItem）。

// DashboardTrendPoint 某一天的创建/完成任务数（跨全部工作区）。
type DashboardTrendPoint struct {
	Day       string `json:"day"`
	Created   int64  `json:"created"`
	Completed int64  `json:"completed"`
}

type DashboardData struct {
	TotalTasks        int64                   `json:"totalTasks"`
	Urgent            int64                   `json:"urgent"`
	NewThisWeek       int64                   `json:"newThisWeek"`
	DoneTasks         int64                   `json:"doneTasks"`
	CompletionPercent int64                   `json:"completionPercent"`
	ByColumn          []DashboardColumnStat   `json:"byColumn"`
	ByPriority        []DashboardPriorityStat `json:"byPriority"`
	Projects          []DashboardProjectStat  `json:"projects"`
	Focus             []DashboardFocusTask    `json:"focus"`
	RecentActivity    []ActivityItem          `json:"recentActivity"`
	Trend             []DashboardTrendPoint   `json:"trend"`
}

// dashboardTrendDays 趋势图窗口天数（含今天）。
const dashboardTrendDays = 14

// GetDashboard 返回仪表盘聚合数据（统计卡 / 分布 / 趋势 / 项目速览 / 需要关注 / 最近活动）。
// 状态口径（2026-08 调整）：任务状态由列位置决定——"已完成"= 位于项目末列（position 最大列），
// 不依赖列名，用户重命名列不影响统计。
func (s *Service) GetDashboard(ctx context.Context) (DashboardData, error) {
	q := gen.New(s.db)

	columns, err := q.ListColumnDistributions(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询列分布失败: %w", err)
	}
	priorities, err := q.ListPriorityDistributions(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询优先级分布失败: %w", err)
	}
	progress, err := q.ListProjectColumnCounts(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询项目进展失败: %w", err)
	}
	tasks, err := q.ListAllTasks(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询任务失败: %w", err)
	}
	focusRows, err := q.ListFocusCandidates(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询需要关注任务失败: %w", err)
	}
	activities, err := q.ListActivitiesWithProject(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询活动失败: %w", err)
	}
	createdTrend, err := q.ListTaskCreationTrend(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询新增趋势失败: %w", err)
	}
	completionTrend, err := q.ListTaskCompletionTrend(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询完成趋势失败: %w", err)
	}
	createdInFinalColumnTrend, err := q.ListTaskCreatedInFinalColumnTrend(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询末列直建完成趋势失败: %w", err)
	}

	var total, done int64
	byColumn := make([]DashboardColumnStat, 0, len(columns))
	for _, c := range columns {
		total += c.TaskCount
		// 状态由列位置定义而非列名：不做任何按名的过滤，分布图与统计卡使用同一列集合。
		byColumn = append(byColumn, DashboardColumnStat{Name: c.ColumnName, Count: c.TaskCount})
	}
	byPriority := make([]DashboardPriorityStat, 0, len(priorities))
	for _, p := range priorities {
		byPriority = append(byPriority, DashboardPriorityStat{Priority: p.Priority, Count: p.TaskCount})
	}

	// 每项目最大列 position：末列 = 已完成（不依赖列名）。
	maxPos := make(map[string]int64, len(progress))
	for _, p := range progress {
		if p.ColumnPosition != nil {
			if cur, ok := maxPos[p.ID]; !ok || *p.ColumnPosition > cur {
				maxPos[p.ID] = *p.ColumnPosition
			}
		}
	}

	type projAgg struct {
		id, name, workspaceID string
		total, done           int64
	}
	projMap := make(map[string]*projAgg)
	var projOrder []string
	for _, p := range progress {
		a, ok := projMap[p.ID]
		if !ok {
			a = &projAgg{id: p.ID, name: p.Name, workspaceID: p.WorkspaceID}
			projMap[p.ID] = a
			projOrder = append(projOrder, p.ID)
		}
		a.total += p.TaskCount
		if p.ColumnPosition != nil && *p.ColumnPosition == maxPos[p.ID] {
			a.done += p.TaskCount
			done += p.TaskCount
		}
	}
	projects := make([]DashboardProjectStat, 0, len(projOrder))
	for _, id := range projOrder {
		a := projMap[id]
		projects = append(projects, DashboardProjectStat{
			ID: a.id, Name: a.name, WorkspaceID: a.workspaceID, Total: a.total, Done: a.done,
		})
	}

	// 「需要关注」：priority=urgent 或有 dueDate，且不在末列，前 8 条（口径与 Mock/0005 §5.6 一致）。
	focus := make([]DashboardFocusTask, 0, 8)
	for _, t := range focusRows {
		if last, ok := maxPos[t.ProjectID]; ok && t.ColumnPosition == last {
			continue // 已完成列（末列）不进「需要关注」
		}
		focus = append(focus, DashboardFocusTask{
			ID:          t.ID,
			Title:       t.Title,
			Column:      t.ColumnName,
			ProjectName: t.ProjectName,
			DueDate:     t.DueDate,
			Urgent:      t.Priority == "urgent",
		})
		if len(focus) >= 8 {
			break
		}
	}

	recent := make([]ActivityItem, 0, 8)
	for i, a := range activities {
		if i >= 8 {
			break
		}
		recent = append(recent, ActivityItem{
			ID:           a.ID,
			ResourceType: "task",
			ResourceID:   a.ResourceID,
			ProjectName:  a.ProjectName,
			Action:       a.Action,
			Data:         a.Data,
			Actor:        a.Actor,
			CreatedAt:    a.CreatedAt,
		})
	}

	completion := int64(0)
	if total > 0 {
		// 与前端 mock 的 Math.round 对齐（整数截断会与 mock 差 1 个百分点）。
		completion = (done*100 + total/2) / total
	}
	// urgent 计数：priority=urgent（与 focus 同口径，不按标签）。
	var urgentCount int64
	for _, t := range tasks {
		if t.Priority == "urgent" {
			urgentCount++
		}
	}
	return DashboardData{
		TotalTasks:        total,
		Urgent:            urgentCount,
		NewThisWeek:       countNewThisWeek(tasks),
		DoneTasks:         done,
		CompletionPercent: completion,
		ByColumn:          byColumn,
		ByPriority:        byPriority,
		Projects:          projects,
		Focus:             focus,
		RecentActivity:    recent,
		Trend:             buildDashboardTrend(createdTrend, completionTrend, createdInFinalColumnTrend, dashboardTrendDays),
	}, nil
}

// buildDashboardTrend 生成近 days 天（含今天）的连续趋势序列，无数据的日期补零。
// 完成数 = 移入末列（completionTrend）+ 末列直建（createdInFinalColumnTrend），
// 与 doneTasks 同口径（此前只数移入末列，末列直建任务缺失导致两数不一致）。
// 日期按 UTC 对齐（activity.created_at / task.created_at 存 UTC RFC3339）。
func buildDashboardTrend(
	created []gen.ListTaskCreationTrendRow,
	completed []gen.ListTaskCompletionTrendRow,
	completedDirect []gen.ListTaskCreatedInFinalColumnTrendRow,
	days int,
) []DashboardTrendPoint {
	createdMap := make(map[string]int64, len(created))
	for _, c := range created {
		createdMap[c.Day] = c.Count
	}
	completedMap := make(map[string]int64, len(completed)+len(completedDirect))
	for _, c := range completed {
		completedMap[c.Day] += c.Count
	}
	for _, c := range completedDirect {
		completedMap[c.Day] += c.Count
	}
	points := make([]DashboardTrendPoint, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		day := now.AddDate(0, 0, -i).Format("2006-01-02")
		points = append(points, DashboardTrendPoint{
			Day:       day,
			Created:   createdMap[day],
			Completed: completedMap[day],
		})
	}
	return points
}

func countNewThisWeek(tasks []gen.ListAllTasksRow) int64 {
	cutoff := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
	var n int64
	for _, t := range tasks {
		if ts, err := time.Parse(time.RFC3339, t.CreatedAt); err == nil && ts.UnixMilli() >= cutoff {
			n++
		}
	}
	return n
}
