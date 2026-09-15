package cli

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (h *mcpHandlers) registerLabelTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_label",
		Description: "Manage project labels: list|create|rename|delete|attach|detach.",
	}, h.label)
}

type labelInput struct {
	Action    string `json:"action" jsonschema:"list|create|rename|delete|attach|detach"`
	ProjectID string `json:"projectId,omitempty" jsonschema:"project id (list/create)"`
	LabelID   string `json:"labelId,omitempty" jsonschema:"label id (rename/delete/attach/detach)"`
	Name      string `json:"name,omitempty" jsonschema:"label name (create/rename)"`
	TaskID    string `json:"taskId,omitempty" jsonschema:"task id (attach/detach)"`
}

func (h *mcpHandlers) label(ctx context.Context, _ *mcp.CallToolRequest, in labelInput) (*mcp.CallToolResult, any, error) {
	switch in.Action {
	case "list":
		if in.ProjectID == "" {
			return nil, nil, fmt.Errorf("projectId is required for list")
		}
		c, err := h.client(true)
		if err != nil {
			return nil, nil, err
		}
		var board struct {
			Labels json.RawMessage `json:"labels"`
		}
		if _, err := c.DoRaw(ctx, "GET", "/api/projects/"+in.ProjectID, nil, &board); err != nil {
			return nil, nil, err
		}
		if len(board.Labels) == 0 {
			board.Labels = []byte("[]")
		}
		return textJSON(board.Labels), nil, nil

	case "create":
		if in.ProjectID == "" || in.Name == "" {
			return nil, nil, fmt.Errorf("projectId and name are required for create")
		}
		return h.doJSON(ctx, true, "POST", "/api/projects/"+in.ProjectID+"/labels", map[string]any{"name": in.Name})

	case "rename":
		if in.LabelID == "" || in.Name == "" {
			return nil, nil, fmt.Errorf("labelId and name are required for rename")
		}
		return h.doJSON(ctx, true, "PATCH", "/api/labels/"+in.LabelID, map[string]any{"name": in.Name})

	case "delete":
		if in.LabelID == "" {
			return nil, nil, fmt.Errorf("labelId is required for delete")
		}
		return h.doJSON(ctx, true, "DELETE", "/api/labels/"+in.LabelID, nil)

	case "attach":
		if in.TaskID == "" || in.LabelID == "" {
			return nil, nil, fmt.Errorf("taskId and labelId are required for attach")
		}
		return h.doJSON(ctx, true, "POST", fmt.Sprintf("/api/tasks/%s/labels/%s", in.TaskID, in.LabelID), nil)

	case "detach":
		if in.TaskID == "" || in.LabelID == "" {
			return nil, nil, fmt.Errorf("taskId and labelId are required for detach")
		}
		return h.doJSON(ctx, true, "DELETE", fmt.Sprintf("/api/tasks/%s/labels/%s", in.TaskID, in.LabelID), nil)

	default:
		return nil, nil, fmt.Errorf("action must be list|create|rename|delete|attach|detach, got %q", in.Action)
	}
}
