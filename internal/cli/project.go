package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
)

func newProjectCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "project",
		Short: "项目操作",
	}
	var workspaceID string
	list := &cobra.Command{
		Use:   "list",
		Short: "列出工作区下的活跃项目",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if workspaceID == "" {
				return fmt.Errorf("请提供 --workspace")
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID         string  `json:"id"`
				Name       string  `json:"name"`
				ArchivedAt *string `json:"archivedAt"`
			}
			path := "/api/workspaces/" + workspaceID + "/projects"
			raw, err := c.DoRaw(context.Background(), "GET", path, nil, &items)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				rows = append(rows, []string{item.ID, item.Name})
			}
			return printTable(out, []string{"ID", "NAME"}, rows)
		},
	}
	list.Flags().StringVar(&workspaceID, "workspace", "", "工作区 ID")
	_ = list.MarkFlagRequired("workspace")

	archived := &cobra.Command{
		Use:   "archived",
		Short: "列出工作区下已归档项目",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if workspaceID == "" {
				return fmt.Errorf("请提供 --workspace")
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID         string  `json:"id"`
				Name       string  `json:"name"`
				ArchivedAt *string `json:"archivedAt"`
			}
			path := "/api/workspaces/" + workspaceID + "/archived-projects"
			raw, err := c.DoRaw(context.Background(), "GET", path, nil, &items)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				rows = append(rows, []string{item.ID, item.Name, optionalDisplay(item.ArchivedAt)})
			}
			return printTable(out, []string{"ID", "NAME", "ARCHIVED_AT"}, rows)
		},
	}
	archived.Flags().StringVar(&workspaceID, "workspace", "", "工作区 ID")
	_ = archived.MarkFlagRequired("workspace")

	archive := &cobra.Command{
		Use:   "archive <project-id>",
		Short: "归档项目（需无未完成活跃任务）",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runProjectArchiveToggle(cmd, opts, args[0], true)
		},
	}
	restore := &cobra.Command{
		Use:   "restore <project-id>",
		Short: "恢复已归档项目",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runProjectArchiveToggle(cmd, opts, args[0], false)
		},
	}

	cmd.AddCommand(list, archived, archive, restore)
	return cmd
}

func runProjectArchiveToggle(cmd *cobra.Command, opts *Options, projectID string, archive bool) error {
	c, err := opts.newClient(true)
	if err != nil {
		return err
	}
	path := "/api/projects/" + projectID + "/restore"
	action := "restored"
	if archive {
		path = "/api/projects/" + projectID + "/archive"
		action = "archived"
	}
	var project map[string]any
	if _, err := c.DoRaw(context.Background(), "POST", path, nil, &project); err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	if opts.JSON {
		return printJSON(out, project)
	}
	writeLine(out, "%s id=%v archivedAt=%v", action, project["id"], project["archivedAt"])
	return nil
}
