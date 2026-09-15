package service_test

import (
	"testing"

	"kanso/internal/service"
)

func TestNormalizeAICaptureDrafts(t *testing.T) {
	catalog := service.AICaptureCatalog{
		Projects: []service.AICaptureProjectCatalog{
			{
				ID:   "p1",
				Name: "项目一",
				Columns: []service.AICaptureCatalogID{
					{ID: "c1", Name: "待办"},
					{ID: "c2", Name: "进行中"},
				},
				Labels: []service.AICaptureCatalogID{
					{ID: "l1", Name: "设计"},
				},
				Milestones: []service.AICaptureCatalogID{
					{ID: "m1", Name: "M1"},
				},
			},
			{
				ID:   "p2",
				Name: "项目二",
				Columns: []service.AICaptureCatalogID{
					{ID: "c3", Name: "待办"},
				},
			},
		},
	}
	drafts := []service.AICaptureDraft{
		{Title: "  ", ProjectID: "p1"},
		{
			Title:        "合法任务",
			Priority:     "high",
			DueDate:      "2026-12-01",
			ProjectID:    "p1",
			ColumnID:     "c2",
			LabelIDs:     []string{"l1", "nope", "l1"},
			MilestoneIDs: []string{"m1", "x"},
		},
		{
			Title:     "坏归属回退",
			Priority:  "nope",
			DueDate:   "bad-date",
			ProjectID: "missing",
			ColumnID:  "missing",
		},
	}
	got := service.NormalizeAICaptureDrafts(catalog, drafts, "p2")
	if len(got) != 2 {
		t.Fatalf("应保留 2 条，实际 %d", len(got))
	}
	if got[0].Title != "合法任务" || got[0].Priority != "high" || got[0].ColumnID != "c2" {
		t.Fatalf("首条不符: %+v", got[0])
	}
	if got[0].DueDate == nil || *got[0].DueDate != "2026-12-01" {
		t.Fatalf("截止日期不符: %+v", got[0].DueDate)
	}
	if len(got[0].LabelIDs) != 1 || got[0].LabelIDs[0] != "l1" {
		t.Fatalf("标签应过滤并去重: %+v", got[0].LabelIDs)
	}
	if len(got[0].MilestoneIDs) != 1 || got[0].MilestoneIDs[0] != "m1" {
		t.Fatalf("里程碑应过滤: %+v", got[0].MilestoneIDs)
	}
	if got[1].ProjectID != "p2" || got[1].ColumnID != "c3" || got[1].Priority != "med" {
		t.Fatalf("坏归属应回退 defaultProject 首列: %+v", got[1])
	}
	if got[1].DueDate != nil {
		t.Fatalf("非法日期应丢弃")
	}
}
