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
// ProjectName/ColumnName 供详情页顶部面包屑与元数据条显示。
type TaskDetail struct {
	Task        TaskDetailTask `json:"task"`
	ProjectName string         `json:"projectName"`
	ColumnName  string         `json:"columnName"`
	Labels      []gen.Label    `json:"labels"`
	Comments    []TaskComment  `json:"comments"`
	Activity    []TaskActivity `json:"activity"`
	// Milestones：该任务关联的里程碑摘要（M5 任务归属，多对多）。
	Milestones []MilestoneRef `json:"milestones"`
}

// TaskDetailTask is the task-detail DTO.
type TaskDetailTask struct {
	gen.Task
}

// MilestoneRef 是任务详情中携带的里程碑摘要(M5 多对多归属)。
// DueDate 指针:null=未设截止。
type MilestoneRef struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	DueDate *string `json:"dueDate"`
}

type TaskComment struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	Author    string `json:"author"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

type TaskActivity struct {
	ID           string  `json:"id"`
	ResourceType string  `json:"resourceType"`
	ResourceID   string  `json:"resourceId"`
	Action       string  `json:"action"`
	Actor        string  `json:"actor"`
	ProjectName  string  `json:"projectName"`
	Data         *string `json:"data"`
	CreatedAt    string  `json:"createdAt"`
}

// CreateComment 发表评论并记录活动（评论即活动，见 spec）。
func (s *Service) CreateComment(ctx context.Context, taskID, content string) (TaskComment, error) {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return TaskComment{}, err
	}
	defer func() { _ = tx.Rollback() }()
	task, err := q.GetTask(ctx, taskID)
	if err != nil {
		return TaskComment{}, mapNoRows(err)
	}
	commentID, err := id.New()
	if err != nil {
		return TaskComment{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	comment, err := q.CreateComment(ctx, gen.CreateCommentParams{
		ID:        commentID,
		TaskID:    taskID,
		Content:   content,
		CreatedAt: now,
		Author:    ActorFromContext(ctx),
	})
	if err != nil {
		return TaskComment{}, fmt.Errorf("发表评论失败: %w", err)
	}
	event := Event{
		Action:         EventCommentCreated,
		ProjectID:      task.ProjectID,
		EntityID:       comment.ID,
		ActivityTaskID: taskID,
		// 评论正文供活动文案展示「发表了评论『内容』」（与 comment.deleted 的 data 形状一致）。
		Data:           map[string]string{"content": comment.Content},
		RecordActivity: true,
		Actor:          ActorFromContext(ctx),
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return TaskComment{}, err
	}
	if err := tx.Commit(); err != nil {
		return TaskComment{}, fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
	return TaskComment{
		ID: comment.ID, TaskID: comment.TaskID, Author: comment.Author,
		Content: comment.Content, CreatedAt: comment.CreatedAt,
	}, nil
}

// DeleteComment 删除评论；不存在时返回 ErrNotFound。
func (s *Service) DeleteComment(ctx context.Context, commentID string) error {
	tx, q, err := beginTx(ctx, s.db)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	comment, err := q.GetComment(ctx, commentID)
	if err != nil {
		return mapNoRows(err)
	}
	task, err := q.GetTask(ctx, comment.TaskID)
	if err != nil {
		return mapNoRows(err)
	}
	n, err := q.DeleteComment(ctx, commentID)
	if err != nil {
		return fmt.Errorf("删除评论失败: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	event := Event{
		Action:         EventCommentDeleted,
		ProjectID:      task.ProjectID,
		EntityID:       commentID,
		ActivityTaskID: comment.TaskID,
		Data:           map[string]string{"content": comment.Content},
		RecordActivity: true,
	}
	if err := s.recordEvent(ctx, q, event); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	s.broadcastEvent(event)
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

// M5:该任务关联的里程碑摘要(task_milestone 多对多)。
	milestoneRows, err := s.db.QueryContext(ctx, `SELECT m.id, m.name, m.due_date FROM milestone m
JOIN task_milestone tm ON tm.milestone_id = m.id
WHERE tm.task_id = ?
ORDER BY m.created_at`, taskID)
	if err != nil {
		return TaskDetail{}, fmt.Errorf("查询任务里程碑失败: %w", err)
	}
	milestones := make([]MilestoneRef, 0)
	for milestoneRows.Next() {
		var ref MilestoneRef
		if err := milestoneRows.Scan(&ref.ID, &ref.Name, &ref.DueDate); err != nil {
			_ = milestoneRows.Close()
			return TaskDetail{}, fmt.Errorf("扫描任务里程碑失败: %w", err)
		}
		milestones = append(milestones, ref)
	}
	_ = milestoneRows.Close()
	if err := milestoneRows.Err(); err != nil {
		return TaskDetail{}, fmt.Errorf("遍历任务里程碑失败: %w", err)
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

	// 项目名/列名供详情页顶部面包屑与元数据条使用；缺失时留空，不阻塞详情渲染。
	projectName := ""
	columnName := ""
	if project, err := q.GetProject(ctx, task.ProjectID); err == nil {
		projectName = project.Name
	}
	if column, err := q.GetColumn(ctx, task.ColumnID); err == nil {
		columnName = column.Name
	}

	taskComments := make([]TaskComment, 0, len(comments))
	for _, comment := range comments {
		taskComments = append(taskComments, TaskComment{
			ID: comment.ID, TaskID: comment.TaskID, Author: comment.Author,
			Content: comment.Content, CreatedAt: comment.CreatedAt,
		})
	}
	taskActivity := make([]TaskActivity, 0, len(activity))
	for _, item := range activity {
		taskActivity = append(taskActivity, TaskActivity{
			ID: item.ID, ResourceType: item.ResourceType, ResourceID: item.ResourceID,
			Action: item.Action, Actor: item.Actor, ProjectName: projectName,
			Data: item.Data, CreatedAt: item.CreatedAt,
		})
	}

	return TaskDetail{
		Task:        TaskDetailTask{Task: task},
		ProjectName: projectName,
		ColumnName:  columnName,
		Labels:      labels,
		Comments:    taskComments,
		Activity:    taskActivity,
		Milestones:  milestones,
	}, nil
}

func recordActivityWithQueries(ctx context.Context, q *gen.Queries, taskID, action string, data any, actor string) error {
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
	_, err = q.CreateActivity(ctx, gen.CreateActivityParams{
		ID:           activityID,
		ResourceType: "task",
		ResourceID:   taskID,
		Action:       action,
		Data:         dataStr,
		Actor:        actor,
		// 纳秒精度保证同秒内操作仍可按时间倒序。
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return fmt.Errorf("记录活动失败: %w", err)
	}
	return nil
}
