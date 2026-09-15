package cli

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func (h *mcpHandlers) registerTaskTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_get_task",
		Description: "Get task detail including labels and milestones.",
	}, h.getTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_create_task",
		Description: "Create a task in a column.",
	}, h.createTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_update_task",
		Description: "Update task title, description, priority, or due date.",
	}, h.updateTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_move_task",
		Description: "Move a task to another column (optional position).",
	}, h.moveTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_archive_task",
		Description: "Archive a task.",
	}, h.archiveTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_restore_task",
		Description: "Restore an archived task.",
	}, h.restoreTask)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_list_archived",
		Description: "List archived tasks in a project.",
	}, h.listArchived)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_delete_task",
		Description: "Permanently delete a task.",
	}, h.deleteTask)
}

type taskIDInput struct {
	TaskID string `json:"taskId" jsonschema:"task id"`
}

type createTaskInput struct {
	ColumnID    string   `json:"columnId" jsonschema:"column id"`
	Title       string   `json:"title" jsonschema:"task title"`
	Priority    string   `json:"priority,omitempty" jsonschema:"urgent|high|med|low"`
	Description string   `json:"description,omitempty" jsonschema:"task description"`
	Due         string   `json:"due,omitempty" jsonschema:"due date YYYY-MM-DD"`
	Labels      []string `json:"labels,omitempty" jsonschema:"label ids to attach on create"`
}

type updateTaskInput struct {
	TaskID      string `json:"taskId" jsonschema:"task id"`
	Title       string `json:"title,omitempty" jsonschema:"new title"`
	Description string `json:"description,omitempty" jsonschema:"new description"`
	Priority    string `json:"priority,omitempty" jsonschema:"urgent|high|med|low"`
	Due         string `json:"due,omitempty" jsonschema:"due date YYYY-MM-DD"`
	ClearDue    bool   `json:"clearDue,omitempty" jsonschema:"clear due date when true"`
}

type moveTaskInput struct {
	TaskID   string `json:"taskId" jsonschema:"task id"`
	ColumnID string `json:"columnId" jsonschema:"target column id"`
	Position int64  `json:"position,omitempty" jsonschema:"position within column, default 0"`
}

func (h *mcpHandlers) getTask(ctx context.Context, _ *mcp.CallToolRequest, in taskIDInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" {
		return nil, nil, fmt.Errorf("taskId is required")
	}
	return h.getJSON(ctx, true, "/api/tasks/"+in.TaskID)
}

func (h *mcpHandlers) createTask(ctx context.Context, _ *mcp.CallToolRequest, in createTaskInput) (*mcp.CallToolResult, any, error) {
	if in.ColumnID == "" || in.Title == "" {
		return nil, nil, fmt.Errorf("columnId and title are required")
	}
	body := map[string]any{"title": in.Title}
	if in.Priority != "" {
		parsed, err := parsePriority(in.Priority)
		if err != nil {
			return nil, nil, err
		}
		body["priority"] = parsed
	}
	if in.Description != "" {
		body["description"] = in.Description
	}
	putDueDate(body, in.Due, false)
	if len(in.Labels) > 0 {
		body["labels"] = in.Labels
	}
	return h.doJSON(ctx, true, "POST", "/api/columns/"+in.ColumnID+"/tasks", body)
}

func (h *mcpHandlers) updateTask(ctx context.Context, _ *mcp.CallToolRequest, in updateTaskInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" {
		return nil, nil, fmt.Errorf("taskId is required")
	}
	body := map[string]any{}
	if in.Title != "" {
		body["title"] = in.Title
	}
	if in.Description != "" {
		body["description"] = in.Description
	}
	if in.Priority != "" {
		parsed, err := parsePriority(in.Priority)
		if err != nil {
			return nil, nil, err
		}
		body["priority"] = parsed
	}
	if in.ClearDue || in.Due != "" {
		putDueDate(body, in.Due, in.ClearDue)
	}
	if len(body) == 0 {
		return nil, nil, fmt.Errorf("provide at least one of title, description, priority, due, or clearDue")
	}
	return h.doJSON(ctx, true, "PATCH", "/api/tasks/"+in.TaskID, body)
}

func (h *mcpHandlers) moveTask(ctx context.Context, _ *mcp.CallToolRequest, in moveTaskInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" || in.ColumnID == "" {
		return nil, nil, fmt.Errorf("taskId and columnId are required")
	}
	body := map[string]any{
		"columnId": in.ColumnID,
		"position": in.Position,
	}
	return h.doJSON(ctx, true, "PATCH", "/api/tasks/"+in.TaskID, body)
}

func (h *mcpHandlers) archiveTask(ctx context.Context, _ *mcp.CallToolRequest, in taskIDInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" {
		return nil, nil, fmt.Errorf("taskId is required")
	}
	return h.doJSON(ctx, true, "POST", "/api/tasks/"+in.TaskID+"/archive", nil)
}

func (h *mcpHandlers) restoreTask(ctx context.Context, _ *mcp.CallToolRequest, in taskIDInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" {
		return nil, nil, fmt.Errorf("taskId is required")
	}
	return h.doJSON(ctx, true, "POST", "/api/tasks/"+in.TaskID+"/restore", nil)
}

func (h *mcpHandlers) listArchived(ctx context.Context, _ *mcp.CallToolRequest, in projectIDInput) (*mcp.CallToolResult, any, error) {
	if in.ProjectID == "" {
		return nil, nil, fmt.Errorf("projectId is required")
	}
	return h.getJSON(ctx, true, "/api/projects/"+in.ProjectID+"/archived-tasks")
}

func (h *mcpHandlers) deleteTask(ctx context.Context, _ *mcp.CallToolRequest, in taskIDInput) (*mcp.CallToolResult, any, error) {
	if in.TaskID == "" {
		return nil, nil, fmt.Errorf("taskId is required")
	}
	return h.doJSON(ctx, true, "DELETE", "/api/tasks/"+in.TaskID, nil)
}
