package cli

import (
	"context"

	"github.com/spf13/cobra"
)

func newLabelCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "label",
		Short: "标签操作",
	}
	cmd.AddCommand(newLabelListCmd(opts))
	cmd.AddCommand(newLabelCreateCmd(opts))
	cmd.AddCommand(newLabelRenameCmd(opts))
	cmd.AddCommand(newLabelDeleteCmd(opts))
	cmd.AddCommand(newLabelAttachCmd(opts))
	cmd.AddCommand(newLabelDetachCmd(opts))
	return cmd
}

func newLabelListCmd(opts *Options) *cobra.Command {
	var projectID string
	cmd := &cobra.Command{
		Use:   "list",
		Short: "列出项目标签（来自看板聚合）",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var board struct {
				Labels []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"labels"`
			}
			if _, err := c.DoRaw(context.Background(), "GET", "/api/projects/"+projectID, nil, &board); err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printJSON(out, board.Labels)
			}
			rows := make([][]string, 0, len(board.Labels))
			for _, item := range board.Labels {
				rows = append(rows, []string{item.ID, item.Name})
			}
			return printTable(out, []string{"ID", "NAME"}, rows)
		},
	}
	cmd.Flags().StringVar(&projectID, "project", "", "项目 ID")
	_ = cmd.MarkFlagRequired("project")
	return cmd
}

func newLabelCreateCmd(opts *Options) *cobra.Command {
	var projectID, name string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "创建项目标签",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var label map[string]any
			raw, err := c.DoRaw(context.Background(), "POST", "/api/projects/"+projectID+"/labels",
				map[string]any{"name": name}, &label)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "created id=%v name=%v", label["id"], label["name"])
			return nil
		},
	}
	cmd.Flags().StringVar(&projectID, "project", "", "项目 ID")
	cmd.Flags().StringVar(&name, "name", "", "标签名称")
	_ = cmd.MarkFlagRequired("project")
	_ = cmd.MarkFlagRequired("name")
	return cmd
}

func newLabelRenameCmd(opts *Options) *cobra.Command {
	var name string
	cmd := &cobra.Command{
		Use:   "rename <label-id>",
		Short: "重命名标签",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var label map[string]any
			raw, err := c.DoRaw(context.Background(), "PATCH", "/api/labels/"+args[0],
				map[string]any{"name": name}, &label)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "updated id=%v name=%v", label["id"], label["name"])
			return nil
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "新名称")
	_ = cmd.MarkFlagRequired("name")
	return cmd
}

func newLabelDeleteCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "delete <label-id>",
		Short: "删除标签",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			if _, err := c.DoRaw(context.Background(), "DELETE", "/api/labels/"+args[0], nil, nil); err != nil {
				return err
			}
			writeLine(cmd.OutOrStdout(), "deleted id=%s", args[0])
			return nil
		},
	}
}

func newLabelAttachCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "attach <task-id> <label-id>",
		Short: "给任务贴标签",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return mutateTaskRelation(opts, cmd.OutOrStdout(), "POST", "labels", "label", args[0], args[1])
		},
	}
}

func newLabelDetachCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "detach <task-id> <label-id>",
		Short: "从任务移除标签",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return mutateTaskRelation(opts, cmd.OutOrStdout(), "DELETE", "labels", "label", args[0], args[1])
		},
	}
}
