package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"kanso/internal/db/gen"
	"kanso/internal/id"
)

// TaskDetail 是任务详情页单次拉取的聚合（任务 + 标签 + 评论 + 活动）。
type TaskDetail struct {
	Task     gen.Task       `json:"task"`
	Labels   []gen.Label    `json:"labels"`
	Comments []gen.Comment  `json:"comments"`
	Activity []gen.Activity `json:"activity"`
}

// ListComments 返回任务的评论（按时间正序）。
func (s *Service) ListComments(ctx context.Context, taskID string) ([]gen.Comment, error) {
	comments, err := gen.New(s.db).ListCommentsByTask(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("查询评论失败: %w", err)
	}
	if comments == nil {
		return []gen.Comment{}, nil
	}
	return comments, nil
}

// CreateComment 发表评论并记录活动（评论即活动，见 spec）。
func (s *Service) CreateComment(ctx context.Context, taskID, content string) (gen.Comment, error) {
	q := gen.New(s.db)
	if _, err := q.GetTask(ctx, taskID); err != nil {
		return gen.Comment{}, mapNoRows(err)
	}
	commentID, err := id.New()
	if err != nil {
		return gen.Comment{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	comment, err := q.CreateComment(ctx, gen.CreateCommentParams{
		ID:        commentID,
		TaskID:    taskID,
		Content:   content,
		CreatedAt: now,
	})
	if err != nil {
		return gen.Comment{}, fmt.Errorf("发表评论失败: %w", err)
	}
	if err := s.recordActivity(ctx, taskID, "comment.created", nil); err != nil {
		return gen.Comment{}, err
	}
	return comment, nil
}

// DeleteComment 删除评论；不存在时返回 ErrNotFound。
func (s *Service) DeleteComment(ctx context.Context, commentID string) error {
	n, err := gen.New(s.db).DeleteComment(ctx, commentID)
	if err != nil {
		return fmt.Errorf("删除评论失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetTaskDetail 返回任务详情聚合；任务不存在时返回 ErrNotFound。
func (s *Service) GetTaskDetail(ctx context.Context, taskID string) (TaskDetail, error) {
	q := gen.New(s.db)

	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return TaskDetail{}, mapNoRows(err)
	}

	labels, err := q.ListTaskLabelsByTask(ctx, taskID)
	if err != nil {
		return TaskDetail{}, fmt.Errorf("查询任务标签失败: %w", err)
	}
	if labels == nil {
		labels = []gen.Label{}
	}

	comments, err := q.ListCommentsByTask(ctx, taskID)
	if err != nil {
		return TaskDetail{}, fmt.Errorf("查询评论失败: %w", err)
	}
	if comments == nil {
		comments = []gen.Comment{}
	}

	activity, err := q.ListActivitiesByResource(ctx, gen.ListActivitiesByResourceParams{
		ResourceType: "task",
		ResourceID:   taskID,
	})
	if err != nil {
		return TaskDetail{}, fmt.Errorf("查询活动失败: %w", err)
	}
	if activity == nil {
		activity = []gen.Activity{}
	}

	return TaskDetail{
		Task:     task,
		Labels:   labels,
		Comments: comments,
		Activity: activity,
	}, nil
}

// recordActivity 在任务下记录一条活动（写操作副作用，spec：写操作统一记录）。
func (s *Service) recordActivity(ctx context.Context, taskID, action string, data any) error {
	var dataStr *string
	if data != nil {
		encoded, err := json.Marshal(data)
		if err != nil {
			return fmt.Errorf("序列化活动数据失败: %w", err)
		}
		s := string(encoded)
		dataStr = &s
	}
	activityID, err := id.New()
	if err != nil {
		return err
	}
	_, err = gen.New(s.db).CreateActivity(ctx, gen.CreateActivityParams{
		ID:           activityID,
		ResourceType: "task",
		ResourceID:   taskID,
		Action:       action,
		Data:         dataStr,
		// 纳秒精度保证同秒内操作仍可按时间倒序。
		CreatedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return fmt.Errorf("记录活动失败: %w", err)
	}
	return nil
}
