package cli

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (h *mcpHandlers) registerMilestoneTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_milestone",
		Description: "Manage milestones: list|create|update|delete|tasks|attach|detach.",
	}, h.milestone)
}

type milestoneInput struct {
	Action      string `json:"action" jsonschema:"list|create|update|delete|tasks|attach|detach"`
	ProjectID   string `json:"projectId,omitempty" jsonschema:"project id (list/create)"`
	MilestoneID string `json:"milestoneId,omitempty" jsonschema:"milestone id"`
	Name        string `json:"name,omitempty" jsonschema:"milestone name (create/update)"`
	Due         string `json:"due,omitempty" jsonschema:"due date YYYY-MM-DD"`
	ClearDue    bool   `json:"clearDue,omitempty" jsonschema:"clear due date when true"`
	TaskID      string `json:"taskId,omitempty" jsonschema:"task id (attach/detach)"`
}

func (h *mcpHandlers) milestone(ctx context.Context, _ *mcp.CallToolRequest, in milestoneInput) (*mcp.CallToolResult, any, error) {
	switch in.Action {
	case "list":
		if in.ProjectID == "" {
			return nil, nil, fmt.Errorf("projectId is required for list")
		}
		return h.getJSON(ctx, true, "/api/projects/"+in.ProjectID+"/milestones")

	case "create":
		if in.ProjectID == "" || in.Name == "" {
			return nil, nil, fmt.Errorf("projectId and name are required for create")
		}
		body := map[string]any{"name": in.Name}
		putDueDate(body, in.Due, false)
		return h.doJSON(ctx, true, "POST", "/api/projects/"+in.ProjectID+"/milestones", body)

	case "update":
		if in.MilestoneID == "" {
			return nil, nil, fmt.Errorf("milestoneId is required for update")
		}
		body := map[string]any{}
		if in.Name != "" {
			body["name"] = in.Name
		}
		if in.ClearDue || in.Due != "" {
			putDueDate(body, in.Due, in.ClearDue)
		}
		if len(body) == 0 {
			return nil, nil, fmt.Errorf("provide name, due, or clearDue for update")
		}
		return h.doJSON(ctx, true, "PATCH", "/api/milestones/"+in.MilestoneID, body)

	case "delete":
		if in.MilestoneID == "" {
			return nil, nil, fmt.Errorf("milestoneId is required for delete")
		}
		return h.doJSON(ctx, true, "DELETE", "/api/milestones/"+in.MilestoneID, nil)

	case "tasks":
		if in.MilestoneID == "" {
			return nil, nil, fmt.Errorf("milestoneId is required for tasks")
		}
		return h.getJSON(ctx, true, "/api/milestones/"+in.MilestoneID+"/tasks")

	case "attach":
		if in.TaskID == "" || in.MilestoneID == "" {
			return nil, nil, fmt.Errorf("taskId and milestoneId are required for attach")
		}
		return h.doJSON(ctx, true, "POST", fmt.Sprintf("/api/tasks/%s/milestones/%s", in.TaskID, in.MilestoneID), nil)

	case "detach":
		if in.TaskID == "" || in.MilestoneID == "" {
			return nil, nil, fmt.Errorf("taskId and milestoneId are required for detach")
		}
		return h.doJSON(ctx, true, "DELETE", fmt.Sprintf("/api/tasks/%s/milestones/%s", in.TaskID, in.MilestoneID), nil)

	default:
		return nil, nil, fmt.Errorf("action must be list|create|update|delete|tasks|attach|detach, got %q", in.Action)
	}
}
