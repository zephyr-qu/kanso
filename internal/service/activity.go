// 全局活动流（活动页 /api/activity 数据源）：拍平所有已埋点资源活动 + 作用域名称。
package service

import (
	"context"
	"fmt"

	"kanso/internal/db/gen"
)

type ActivityItem struct {
	ID           string  `json:"id"`
	ResourceType string  `json:"resourceType"`
	ResourceID   string  `json:"resourceId"`
	ProjectName  string  `json:"projectName"`
	Action       string  `json:"action"`
	Actor        string  `json:"actor"`
	Data         *string `json:"data"`
	CreatedAt    string  `json:"createdAt"`
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
			ID:           r.ID,
			ResourceType: r.ResourceType,
			ResourceID:   r.ResourceID,
			ProjectName:  r.ProjectName,
			Action:       r.Action,
			Actor:        r.Actor,
			Data:         r.Data,
			CreatedAt:    r.CreatedAt,
		})
	}
	return items, nil
}
