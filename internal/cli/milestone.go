package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
)

func newMilestoneCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "milestone",
		Short: "里程碑操作",
	}
	cmd.AddCommand(newMilestoneListCmd(opts))
	cmd.AddCommand(newMilestoneCreateCmd(opts))
	cmd.AddCommand(newMilestoneUpdateCmd(opts))
	cmd.AddCommand(newMilestoneDeleteCmd(opts))
	cmd.AddCommand(newMilestoneTasksCmd(opts))
	cmd.AddCommand(newMilestoneAttachCmd(opts))
	cmd.AddCommand(newMilestoneDetachCmd(opts))
	return cmd
}

func newMilestoneListCmd(opts *Options) *cobra.Command {
	var projectID string
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出项目里程碑",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID       string  `json:"id"`
				Name     string  `json:"name"`
				DueDate  *string `json:"dueDate"`
				Progress *struct {
					Done  int64 `json:"done"`
					Total int64 `json:"total"`
				} `json:"progress"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/projects/"+projectID+"/milestones", nil, &items)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				due := "—"
				if item.DueDate != nil && *item.DueDate != "" {
					due = *item.DueDate
				}
				progress := "—"
				if item.Progress != nil {
					progress = fmt.Sprintf("%d/%d", item.Progress.Done, item.Progress.Total)
				}
				rows = append(rows, []string{item.ID, item.Name, due, progress})
			}
			return printTable(out, []string{"ID", "NAME", "DUE", "PROGRESS"}, rows)
		},
	}
	cmd.Flags().StringVar(&projectID, "project", "", "项目 ID")
	_ = cmd.MarkFlagRequired("project")
	return cmd
}

func newMilestoneCreateCmd(opts *Options) *cobra.Command {
	var projectID, name, due string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "创建里程碑",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			body := map[string]any{"name": name}
			applyDueDateFlags(cmd, body, due, false)
			var item map[string]any
			raw, err := c.DoRaw(context.Background(), "POST", "/api/projects/"+projectID+"/milestones", body, &item)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "created id=%v name=%v dueDate=%v", item["id"], item["name"], item["dueDate"])
			return nil
		},
	}
	cmd.Flags().StringVar(&projectID, "project", "", "项目 ID")
	cmd.Flags().StringVar(&name, "name", "", "里程碑名称")
	cmd.Flags().StringVar(&due, "due", "", "截止日期 YYYY-MM-DD")
	_ = cmd.MarkFlagRequired("project")
	_ = cmd.MarkFlagRequired("name")
	return cmd
}

func newMilestoneUpdateCmd(opts *Options) *cobra.Command {
	var name, due string
	var clearDue bool
	cmd := &cobra.Command{
		Use:   "update <milestone-id>",
		Short: "更新里程碑名称或截止日期",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			body := map[string]any{}
			if cmd.Flags().Changed("name") {
				body["name"] = name
			}
			applyDueDateFlags(cmd, body, due, clearDue)
			if len(body) == 0 {
				return fmt.Errorf("请至少提供 --name、--due 或 --clear-due")
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var item map[string]any
			raw, err := c.DoRaw(context.Background(), "PATCH", "/api/milestones/"+args[0], body, &item)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "updated id=%v name=%v dueDate=%v", item["id"], item["name"], item["dueDate"])
			return nil
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "新名称")
	cmd.Flags().StringVar(&due, "due", "", "截止日期 YYYY-MM-DD")
	cmd.Flags().BoolVar(&clearDue, "clear-due", false, "清除截止日期")
	return cmd
}

func newMilestoneDeleteCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "delete <milestone-id>",
		Short: "删除里程碑",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			if _, err := c.DoRaw(context.Background(), "DELETE", "/api/milestones/"+args[0], nil, nil); err != nil {
				return err
			}
			writeLine(cmd.OutOrStdout(), "deleted id=%s", args[0])
			return nil
		},
	}
}

func newMilestoneTasksCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "tasks <milestone-id>",
		Short: "列出里程碑关联的任务",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID         string `json:"id"`
				Title      string `json:"title"`
				ColumnName string `json:"columnName"`
				Archived   bool   `json:"archived"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/milestones/"+args[0]+"/tasks", nil, &items)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				archived := "no"
				if item.Archived {
					archived = "yes"
				}
				rows = append(rows, []string{item.ID, item.Title, item.ColumnName, archived})
			}
			return printTable(out, []string{"ID", "TITLE", "COLUMN", "ARCHIVED"}, rows)
		},
	}
}

func newMilestoneAttachCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "attach <task-id> <milestone-id>",
		Short: "关联任务到里程碑",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return mutateTaskRelation(opts, cmd.OutOrStdout(), "POST", "milestones", "milestone", args[0], args[1])
		},
	}
}

func newMilestoneDetachCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "detach <task-id> <milestone-id>",
		Short: "解除任务与里程碑关联",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return mutateTaskRelation(opts, cmd.OutOrStdout(), "DELETE", "milestones", "milestone", args[0], args[1])
		},
	}
}
