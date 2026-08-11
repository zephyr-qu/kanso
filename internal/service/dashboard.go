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

type DashboardProjectStat struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	WorkspaceID string `json:"workspaceId"`
	Done        int64  `json:"done"`
	Total       int64  `json:"total"`
}

type DashboardFocusTask struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Column string `json:"column"`
	Urgent bool   `json:"urgent"`
}

// DashboardActivityItem 仪表盘「最近活动」条目——结构化字段，文案由前端统一渲染
// （ActivityItem 组件；Go 不拼文案，见 ADR-0004 前后端无共享类型包的约束）。
type DashboardActivityItem struct {
	ID          string `json:"id"`
	ProjectName string `json:"projectName"`
	Action      string `json:"action"`
	CreatedAt   string `json:"createdAt"`
}

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
	Projects          []DashboardProjectStat  `json:"projects"`
	Focus             []DashboardFocusTask    `json:"focus"`
	RecentActivity    []DashboardActivityItem `json:"recentActivity"`
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
	progress, err := q.ListProjectColumnCounts(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询项目进展失败: %w", err)
	}
	tasks, err := q.ListAllTasks(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询任务失败: %w", err)
	}
	urgent, err := q.ListTaskLabels(ctx)
	if err != nil {
		return DashboardData{}, fmt.Errorf("查询紧急任务失败: %w", err)
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

	var total, done int64
	byColumn := make([]DashboardColumnStat, 0, len(columns))
	for _, c := range columns {
		total += c.TaskCount
		byColumn = append(byColumn, DashboardColumnStat{Name: c.ColumnName, Count: c.TaskCount})
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

	// 紧急任务：按标签名过滤（避免 SQL 中文）。
	urgentTasks := make([]gen.ListTaskLabelsRow, 0)
	for _, t := range urgent {
		if t.LabelName == "紧急" {
			urgentTasks = append(urgentTasks, t)
		}
	}
	focus := make([]DashboardFocusTask, 0, len(urgentTasks))
	for _, t := range urgentTasks {
		focus = append(focus, DashboardFocusTask{
			ID: t.ID, Title: t.Title, Column: t.ColumnName, Urgent: true,
		})
	}

	recent := make([]DashboardActivityItem, 0, 8)
	for i, a := range activities {
		if i >= 8 {
			break
		}
		recent = append(recent, DashboardActivityItem{
			ID:          a.ID,
			ProjectName: a.ProjectName,
			Action:      a.Action,
			CreatedAt:   a.CreatedAt,
		})
	}

	completion := int64(0)
	if total > 0 {
		// 与前端 mock 的 Math.round 对齐（整数截断会与 mock 差 1 个百分点）。
		completion = (done*100 + total/2) / total
	}

	return DashboardData{
		TotalTasks:        total,
		Urgent:            int64(len(urgentTasks)),
		NewThisWeek:       countNewThisWeek(tasks),
		DoneTasks:         done,
		CompletionPercent: completion,
		ByColumn:          byColumn,
		Projects:          projects,
		Focus:             focus,
		RecentActivity:    recent,
		Trend:             buildDashboardTrend(createdTrend, completionTrend, dashboardTrendDays),
	}, nil
}

// buildDashboardTrend 生成近 days 天（含今天）的连续趋势序列，无数据的日期补零。
// 日期按 UTC 对齐（activity.created_at 存 UTC RFC3339）。
func buildDashboardTrend(
	created []gen.ListTaskCreationTrendRow,
	completed []gen.ListTaskCompletionTrendRow,
	days int,
) []DashboardTrendPoint {
	createdMap := make(map[string]int64, len(created))
	for _, c := range created {
		createdMap[c.Day] = c.Count
	}
	completedMap := make(map[string]int64, len(completed))
	for _, c := range completed {
		completedMap[c.Day] = c.Count
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
