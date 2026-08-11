// 全局活动流（活动页 /api/activity 数据源）：拍平全部任务活动 + 项目名。
package service

import (
	"context"
	"fmt"

	"kanso/internal/db/gen"
)

type ActivityItem struct {
	ID          string `json:"id"`
	ProjectName string `json:"projectName"`
	Action      string `json:"action"`
	CreatedAt   string `json:"createdAt"`
}

// GetActivities 返回全部任务活动流（按时间倒序）。
func (s *Service) GetActivities(ctx context.Context) ([]ActivityItem, error) {
	rows, err := gen.New(s.db).ListActivitiesWithProject(ctx)
	if err != nil {
		return nil, fmt.Errorf("查询活动失败: %w", err)
	}
	items := make([]ActivityItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, ActivityItem{
			ID:          r.ID,
			ProjectName: r.ProjectName,
			Action:      r.Action,
			CreatedAt:   r.CreatedAt,
		})
	}
	return items, nil
}
