package cli

import (
	"context"

	"github.com/spf13/cobra"
)

func newWorkspaceCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workspace",
		Short: "工作区操作",
	}
	cmd.AddCommand(&cobra.Command{
		Use:   "list",
		Short: "列出工作区",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/workspaces", nil, &items)
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
	})
	return cmd
}
