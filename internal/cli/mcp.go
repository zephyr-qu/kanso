package cli

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/spf13/cobra"
)

func newMCPCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "mcp",
		Short: "以 stdio 运行 MCP 服务（供 AI 代理调用）",
		Long:  "启动 Model Context Protocol 服务，工具覆盖 health/whoami/workspace/project/board/task/label/milestone；不含 serve、成员、备份与设置。",
		RunE: func(cmd *cobra.Command, _ []string) error {
			server := newMCPServer(opts)
			return server.Run(cmd.Context(), &mcp.StdioTransport{})
		},
	}
}

func newMCPServer(opts *Options) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "kanso",
		Version: opts.Version,
	}, nil)
	h := &mcpHandlers{opts: opts}
	h.register(server)
	return server
}

// NewMCPServerForTest 导出给包外测试（in-memory transport）。
func NewMCPServerForTest(opts *Options) *mcp.Server {
	return newMCPServer(opts)
}

type mcpHandlers struct {
	opts *Options
}

func (h *mcpHandlers) register(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_health",
		Description: "Check Kanso API health (no auth).",
	}, h.health)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_whoami",
		Description: "Show the current authenticated member.",
	}, h.whoami)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_list_workspaces",
		Description: "List workspaces visible to the current member.",
	}, h.listWorkspaces)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_list_projects",
		Description: "List active (non-archived) projects in a workspace.",
	}, h.listProjects)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_list_archived_projects",
		Description: "List archived projects in a workspace.",
	}, h.listArchivedProjects)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_show_board",
		Description: "Show a project board (columns, tasks, labels). Archived projects are read-only.",
	}, h.showBoard)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_archive_project",
		Description: "Archive a project. Fails if any active incomplete tasks remain (not archived and not in the final column). Confirm with the user first.",
	}, h.archiveProject)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "kanso_restore_project",
		Description: "Restore an archived project to the active list. Confirm with the user first.",
	}, h.restoreProject)

	h.registerTaskTools(server)
	h.registerLabelTools(server)
	h.registerMilestoneTools(server)
}

type emptyInput struct{}

type projectIDInput struct {
	ProjectID string `json:"projectId" jsonschema:"project id"`
}

type workspaceIDInput struct {
	WorkspaceID string `json:"workspaceId" jsonschema:"workspace id"`
}

func (h *mcpHandlers) health(ctx context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	return h.getJSON(ctx, false, "/api/health")
}

func (h *mcpHandlers) whoami(ctx context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	return h.getJSON(ctx, true, "/api/me")
}

func (h *mcpHandlers) listWorkspaces(ctx context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, any, error) {
	return h.getJSON(ctx, true, "/api/workspaces")
}

func (h *mcpHandlers) listProjects(ctx context.Context, _ *mcp.CallToolRequest, in workspaceIDInput) (*mcp.CallToolResult, any, error) {
	if in.WorkspaceID == "" {
		return nil, nil, fmt.Errorf("workspaceId is required")
	}
	return h.getJSON(ctx, true, "/api/workspaces/"+in.WorkspaceID+"/projects")
}

func (h *mcpHandlers) listArchivedProjects(ctx context.Context, _ *mcp.CallToolRequest, in workspaceIDInput) (*mcp.CallToolResult, any, error) {
	if in.WorkspaceID == "" {
		return nil, nil, fmt.Errorf("workspaceId is required")
	}
	return h.getJSON(ctx, true, "/api/workspaces/"+in.WorkspaceID+"/archived-projects")
}

func (h *mcpHandlers) showBoard(ctx context.Context, _ *mcp.CallToolRequest, in projectIDInput) (*mcp.CallToolResult, any, error) {
	if in.ProjectID == "" {
		return nil, nil, fmt.Errorf("projectId is required")
	}
	return h.getJSON(ctx, true, "/api/projects/"+in.ProjectID)
}

func (h *mcpHandlers) archiveProject(ctx context.Context, _ *mcp.CallToolRequest, in projectIDInput) (*mcp.CallToolResult, any, error) {
	if in.ProjectID == "" {
		return nil, nil, fmt.Errorf("projectId is required")
	}
	return h.doJSON(ctx, true, "POST", "/api/projects/"+in.ProjectID+"/archive", nil)
}

func (h *mcpHandlers) restoreProject(ctx context.Context, _ *mcp.CallToolRequest, in projectIDInput) (*mcp.CallToolResult, any, error) {
	if in.ProjectID == "" {
		return nil, nil, fmt.Errorf("projectId is required")
	}
	return h.doJSON(ctx, true, "POST", "/api/projects/"+in.ProjectID+"/restore", nil)
}

func (h *mcpHandlers) client(needAuth bool) (*Client, error) {
	return h.opts.newClient(needAuth)
}

func (h *mcpHandlers) getJSON(ctx context.Context, needAuth bool, path string) (*mcp.CallToolResult, any, error) {
	c, err := h.client(needAuth)
	if err != nil {
		return nil, nil, err
	}
	raw, err := c.DoRaw(ctx, "GET", path, nil, nil)
	if err != nil {
		return nil, nil, err
	}
	return textJSON(raw), nil, nil
}

func (h *mcpHandlers) doJSON(ctx context.Context, needAuth bool, method, path string, body any) (*mcp.CallToolResult, any, error) {
	c, err := h.client(needAuth)
	if err != nil {
		return nil, nil, err
	}
	raw, err := c.DoRaw(ctx, method, path, body, nil)
	if err != nil {
		return nil, nil, err
	}
	if len(raw) == 0 {
		return textJSON([]byte(`{"ok":true}`)), nil, nil
	}
	return textJSON(raw), nil, nil
}

func textJSON(raw []byte) *mcp.CallToolResult {
	if !json.Valid(raw) {
		raw, _ = json.Marshal(string(raw))
	}
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}},
	}
}

func putDueDate(body map[string]any, due string, clearDue bool) {
	if clearDue {
		body["dueDate"] = ""
		return
	}
	if due != "" {
		body["dueDate"] = due
	}
}
