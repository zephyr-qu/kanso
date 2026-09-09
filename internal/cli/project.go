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
		Short: "列出工作区下的项目",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if workspaceID == "" {
				return fmt.Errorf("请提供 --workspace")
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
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
	cmd.AddCommand(list)
	return cmd
}
