package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"kanso/internal/ai"
)

const (
	aiCaptureMaxTextRunes = 8000
	aiCaptureMaxTasks     = 20
)

// AICaptureCatalogID 是喂给模型的可选 ID 名称对。
type AICaptureCatalogID struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AICaptureProjectCatalog 是工作区内一个项目的归属候选。
type AICaptureProjectCatalog struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Columns    []AICaptureCatalogID `json:"columns"`
	Labels     []AICaptureCatalogID `json:"labels"`
	Milestones []AICaptureCatalogID `json:"milestones"`
}

// AICaptureCatalog 是 analyze 时注入模型的工作区目录。
type AICaptureCatalog struct {
	Projects []AICaptureProjectCatalog `json:"projects"`
}

// AICaptureDraft 是模型原始草稿（未校验）。
type AICaptureDraft struct {
	Title         string   `json:"title"`
	Priority      string   `json:"priority"`
	DueDate       string   `json:"dueDate"`
	ProjectID     string   `json:"projectId"`
	ColumnID      string   `json:"columnId"`
	LabelIDs      []string `json:"labelIds"`
	MilestoneIDs  []string `json:"milestoneIds"`
}

// AICaptureTask 是校验后的候选任务。
type AICaptureTask struct {
	Title        string   `json:"title"`
	Priority     string   `json:"priority"`
	DueDate      *string  `json:"dueDate"`
	ProjectID    string   `json:"projectId"`
	ColumnID     string   `json:"columnId"`
	LabelIDs     []string `json:"labelIds"`
	MilestoneIDs []string `json:"milestoneIds"`
}

// BuildAICaptureCatalog 组装工作区项目/列/标签/里程碑目录。
func (s *Service) BuildAICaptureCatalog(ctx context.Context, workspaceID string) (AICaptureCatalog, error) {
	projects, err := s.ListProjects(ctx, workspaceID)
	if err != nil {
		return AICaptureCatalog{}, err
	}
	out := AICaptureCatalog{Projects: make([]AICaptureProjectCatalog, 0, len(projects))}
	for _, p := range projects {
		board, err := s.GetBoard(ctx, p.ID)
		if err != nil {
			return AICaptureCatalog{}, err
		}
		ms, err := s.ListMilestones(ctx, p.ID)
		if err != nil {
			return AICaptureCatalog{}, err
		}
		entry := AICaptureProjectCatalog{
			ID:         p.ID,
			Name:       p.Name,
			Columns:    make([]AICaptureCatalogID, 0, len(board.Columns)),
			Labels:     make([]AICaptureCatalogID, 0, len(board.Labels)),
			Milestones: make([]AICaptureCatalogID, 0, len(ms)),
		}
		for _, col := range board.Columns {
			entry.Columns = append(entry.Columns, AICaptureCatalogID{ID: col.ID, Name: col.Name})
		}
		for _, label := range board.Labels {
			entry.Labels = append(entry.Labels, AICaptureCatalogID{ID: label.ID, Name: label.Name})
		}
		for _, m := range ms {
			entry.Milestones = append(entry.Milestones, AICaptureCatalogID{ID: m.ID, Name: m.Name})
		}
		out.Projects = append(out.Projects, entry)
	}
	return out, nil
}

// NormalizeAICaptureDrafts 校验并裁剪模型输出。
func NormalizeAICaptureDrafts(catalog AICaptureCatalog, drafts []AICaptureDraft, defaultProjectID string) []AICaptureTask {
	if len(catalog.Projects) == 0 {
		return nil
	}
	projectByID := make(map[string]AICaptureProjectCatalog, len(catalog.Projects))
	for _, p := range catalog.Projects {
		projectByID[p.ID] = p
	}
	fallbackProject := catalog.Projects[0]
	if defaultProjectID != "" {
		if p, ok := projectByID[defaultProjectID]; ok {
			fallbackProject = p
		}
	}
	out := make([]AICaptureTask, 0, min(len(drafts), aiCaptureMaxTasks))
	for _, draft := range drafts {
		if len(out) >= aiCaptureMaxTasks {
			break
		}
		title := strings.TrimSpace(draft.Title)
		if title == "" {
			continue
		}
		project := fallbackProject
		if draft.ProjectID != "" {
			if p, ok := projectByID[draft.ProjectID]; ok {
				project = p
			}
		}
		if len(project.Columns) == 0 {
			continue
		}
		columnID := project.Columns[0].ID
		columnOK := map[string]struct{}{}
		for _, c := range project.Columns {
			columnOK[c.ID] = struct{}{}
		}
		if draft.ColumnID != "" {
			if _, ok := columnOK[draft.ColumnID]; ok {
				columnID = draft.ColumnID
			}
		}
		labelOK := map[string]struct{}{}
		for _, l := range project.Labels {
			labelOK[l.ID] = struct{}{}
		}
		labels := make([]string, 0, len(draft.LabelIDs))
		seenLabel := map[string]struct{}{}
		for _, id := range draft.LabelIDs {
			if _, ok := labelOK[id]; !ok {
				continue
			}
			if _, dup := seenLabel[id]; dup {
				continue
			}
			seenLabel[id] = struct{}{}
			labels = append(labels, id)
		}
		msOK := map[string]struct{}{}
		for _, m := range project.Milestones {
			msOK[m.ID] = struct{}{}
		}
		milestones := make([]string, 0, len(draft.MilestoneIDs))
		seenMS := map[string]struct{}{}
		for _, id := range draft.MilestoneIDs {
			if _, ok := msOK[id]; !ok {
				continue
			}
			if _, dup := seenMS[id]; dup {
				continue
			}
			seenMS[id] = struct{}{}
			milestones = append(milestones, id)
		}
		priority := "med"
		switch draft.Priority {
		case "urgent", "high", "med", "low":
			priority = draft.Priority
		}
		var due *string
		if d := strings.TrimSpace(draft.DueDate); d != "" {
			if _, err := time.Parse("2006-01-02", d); err == nil {
				due = &d
			}
		}
		out = append(out, AICaptureTask{
			Title:        title,
			Priority:     priority,
			DueDate:      due,
			ProjectID:    project.ID,
			ColumnID:     columnID,
			LabelIDs:     labels,
			MilestoneIDs: milestones,
		})
	}
	return out
}

// AnalyzeAICapture 调用模型并把结果规范化为候选任务。
func (s *Service) AnalyzeAICapture(
	ctx context.Context,
	client *ai.ChatClient,
	workspaceID, text, defaultProjectID string,
) ([]AICaptureTask, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("%w: 文本不能为空", ErrInvalidInput)
	}
	if utf8.RuneCountInString(text) > aiCaptureMaxTextRunes {
		return nil, fmt.Errorf("%w: 文本过长（最多 %d 字）", ErrInvalidInput, aiCaptureMaxTextRunes)
	}
	if client == nil || strings.TrimSpace(client.APIKey) == "" {
		return nil, fmt.Errorf("%w: 未配置 AI", ErrInvalidInput)
	}
	catalog, err := s.BuildAICaptureCatalog(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if len(catalog.Projects) == 0 {
		return nil, fmt.Errorf("%w: 工作区尚无项目", ErrInvalidInput)
	}
	catalogJSON, err := json.Marshal(catalog)
	if err != nil {
		return nil, err
	}
	system := `你是看板助手。根据用户粘贴的文本，拆成可执行任务。
只输出 JSON 对象，形状为 {"tasks":[{"title":"...","priority":"urgent|high|med|low","dueDate":"YYYY-MM-DD","projectId":"...","columnId":"...","labelIds":["..."],"milestoneIds":["..."]}]}。
规则：
- title 必填；priority/dueDate/labelIds/milestoneIds 可选。
- projectId/columnId/labelIds/milestoneIds 必须来自下方 catalog 的 id；不确定时用 catalog 第一个项目及其第一列。
- 最多 20 条任务；不要输出解释文字。
catalog=` + string(catalogJSON)
	content, err := client.CompleteJSON(ctx, system, text)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Tasks []AICaptureDraft `json:"tasks"`
	}
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil, fmt.Errorf("%w: AI 返回非 JSON", ErrInvalidInput)
	}
	return NormalizeAICaptureDrafts(catalog, parsed.Tasks, defaultProjectID), nil
}
