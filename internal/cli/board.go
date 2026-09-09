package cli

import (
	"context"

	"github.com/spf13/cobra"
)

func newBoardCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "board",
		Short: "看板操作",
	}
	cmd.AddCommand(&cobra.Command{
		Use:   "show <project-id>",
		Short: "显示项目看板（列与任务）",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var board struct {
				Project struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"project"`
				Columns []struct {
					ID    string `json:"id"`
					Name  string `json:"name"`
					Tasks []struct {
						ID       string  `json:"id"`
						Title    string  `json:"title"`
						Priority *string `json:"priority"`
					} `json:"tasks"`
				} `json:"columns"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/projects/"+args[0], nil, &board)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "project %s (%s)", board.Project.Name, board.Project.ID)
			rows := make([][]string, 0)
			for _, col := range board.Columns {
				if len(col.Tasks) == 0 {
					rows = append(rows, []string{col.Name, col.ID, "—", "—", "—"})
					continue
				}
				for _, task := range col.Tasks {
					priority := "med"
					if task.Priority != nil && *task.Priority != "" {
						priority = *task.Priority
					}
					rows = append(rows, []string{col.Name, col.ID, task.ID, task.Title, priority})
				}
			}
			return printTable(out, []string{"COLUMN", "COLUMN_ID", "TASK_ID", "TITLE", "PRIORITY"}, rows)
		},
	})
	return cmd
}
