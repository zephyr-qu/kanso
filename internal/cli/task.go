package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

func newTaskCmd(opts *Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "task",
		Short: "任务操作",
	}
	cmd.AddCommand(newTaskGetCmd(opts))
	cmd.AddCommand(newTaskCreateCmd(opts))
	cmd.AddCommand(newTaskUpdateCmd(opts))
	cmd.AddCommand(newTaskMoveCmd(opts))
	cmd.AddCommand(newTaskPriorityCmd(opts))
	cmd.AddCommand(newTaskArchiveCmd(opts))
	cmd.AddCommand(newTaskRestoreCmd(opts))
	cmd.AddCommand(newTaskArchivedCmd(opts))
	cmd.AddCommand(newTaskDeleteCmd(opts))
	return cmd
}

func newTaskGetCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "get <task-id>",
		Short: "查看任务详情",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var detail struct {
				Task struct {
					ID          string  `json:"id"`
					Title       string  `json:"title"`
					ColumnID    string  `json:"columnId"`
					Priority    string  `json:"priority"`
					Description *string `json:"description"`
					DueDate     *string `json:"dueDate"`
					ArchivedAt  *string `json:"archivedAt"`
				} `json:"task"`
				Labels []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"labels"`
				Milestones []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"milestones"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/tasks/"+args[0], nil, &detail)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			task := detail.Task
			writeLine(out, "id=%s title=%s columnId=%s priority=%s dueDate=%s archived=%v",
				task.ID, task.Title, task.ColumnID, task.Priority, optionalDisplay(task.DueDate), task.ArchivedAt != nil)
			if task.Description != nil && *task.Description != "" {
				writeLine(out, "description=%s", *task.Description)
			}
			if len(detail.Labels) > 0 {
				parts := make([]string, 0, len(detail.Labels))
				for _, label := range detail.Labels {
					parts = append(parts, label.Name+"("+label.ID+")")
				}
				writeLine(out, "labels=%s", strings.Join(parts, ", "))
			}
			if len(detail.Milestones) > 0 {
				parts := make([]string, 0, len(detail.Milestones))
				for _, ms := range detail.Milestones {
					parts = append(parts, ms.Name+"("+ms.ID+")")
				}
				writeLine(out, "milestones=%s", strings.Join(parts, ", "))
			}
			return nil
		},
	}
}

func newTaskCreateCmd(opts *Options) *cobra.Command {
	var columnID, title, priority, description, due string
	var labels []string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "在指定列创建任务",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			body := map[string]any{"title": title}
			if priority != "" {
				parsed, err := parsePriority(priority)
				if err != nil {
					return err
				}
				body["priority"] = parsed
			}
			if cmd.Flags().Changed("description") {
				body["description"] = description
			}
			applyDueDateFlags(cmd, body, due, false)
			if len(labels) > 0 {
				body["labels"] = labels
			}
			var task map[string]any
			raw, err := c.DoRaw(context.Background(), "POST", "/api/columns/"+columnID+"/tasks", body, &task)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "created id=%v title=%v columnId=%v priority=%v",
				task["id"], task["title"], task["columnId"], task["priority"])
			return nil
		},
	}
	cmd.Flags().StringVar(&columnID, "column", "", "列 ID")
	cmd.Flags().StringVar(&title, "title", "", "任务标题")
	cmd.Flags().StringVar(&priority, "priority", "", "优先级 urgent|high|med|low")
	cmd.Flags().StringVar(&description, "description", "", "描述")
	cmd.Flags().StringVar(&due, "due", "", "截止日期 YYYY-MM-DD")
	cmd.Flags().StringSliceVar(&labels, "label", nil, "创建时贴上的标签 ID（可重复）")
	_ = cmd.MarkFlagRequired("column")
	_ = cmd.MarkFlagRequired("title")
	return cmd
}

func newTaskUpdateCmd(opts *Options) *cobra.Command {
	var title, description, due, priority string
	var clearDue bool
	cmd := &cobra.Command{
		Use:   "update <task-id>",
		Short: "更新任务标题/描述/优先级/截止日期",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			body := map[string]any{}
			if cmd.Flags().Changed("title") {
				body["title"] = title
			}
			if cmd.Flags().Changed("description") {
				body["description"] = description
			}
			if cmd.Flags().Changed("priority") {
				parsed, err := parsePriority(priority)
				if err != nil {
					return err
				}
				body["priority"] = parsed
			}
			applyDueDateFlags(cmd, body, due, clearDue)
			if len(body) == 0 {
				return fmt.Errorf("请至少提供 --title、--description、--priority、--due 或 --clear-due")
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var task map[string]any
			raw, err := c.DoRaw(context.Background(), "PATCH", "/api/tasks/"+args[0], body, &task)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "updated id=%v title=%v priority=%v dueDate=%v",
				task["id"], task["title"], task["priority"], task["dueDate"])
			return nil
		},
	}
	cmd.Flags().StringVar(&title, "title", "", "新标题")
	cmd.Flags().StringVar(&description, "description", "", "新描述")
	cmd.Flags().StringVar(&priority, "priority", "", "优先级 urgent|high|med|low")
	cmd.Flags().StringVar(&due, "due", "", "截止日期 YYYY-MM-DD")
	cmd.Flags().BoolVar(&clearDue, "clear-due", false, "清除截止日期")
	return cmd
}

func newTaskMoveCmd(opts *Options) *cobra.Command {
	var columnID string
	var position int64
	cmd := &cobra.Command{
		Use:   "move <task-id>",
		Short: "移动任务到目标列",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			body := map[string]any{
				"columnId": columnID,
				"position": position,
			}
			var task map[string]any
			raw, err := c.DoRaw(context.Background(), "PATCH", "/api/tasks/"+args[0], body, &task)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "moved id=%v columnId=%v position=%v",
				task["id"], task["columnId"], task["position"])
			return nil
		},
	}
	cmd.Flags().StringVar(&columnID, "column", "", "目标列 ID")
	cmd.Flags().Int64Var(&position, "position", 0, "列内位置（默认 0）")
	_ = cmd.MarkFlagRequired("column")
	return cmd
}

func newTaskPriorityCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "priority <task-id> <urgent|high|med|low>",
		Short: "修改任务优先级",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			priority, err := parsePriority(args[1])
			if err != nil {
				return err
			}
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			body := map[string]any{"priority": priority}
			var task map[string]any
			raw, err := c.DoRaw(context.Background(), "PATCH", "/api/tasks/"+args[0], body, &task)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			writeLine(out, "updated id=%v priority=%v", task["id"], task["priority"])
			return nil
		},
	}
}

func newTaskArchiveCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "archive <task-id>",
		Short: "归档任务",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTaskArchiveToggle(cmd, opts, args[0], true)
		},
	}
}

func newTaskRestoreCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "restore <task-id>",
		Short: "恢复已归档任务",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTaskArchiveToggle(cmd, opts, args[0], false)
		},
	}
}

func runTaskArchiveToggle(cmd *cobra.Command, opts *Options, taskID string, archive bool) error {
	c, err := opts.newClient(true)
	if err != nil {
		return err
	}
	path := "/api/tasks/" + taskID + "/restore"
	action := "restored"
	if archive {
		path = "/api/tasks/" + taskID + "/archive"
		action = "archived"
	}
	var task map[string]any
	raw, err := c.DoRaw(context.Background(), "POST", path, nil, &task)
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	if opts.JSON {
		return printRawJSON(out, raw)
	}
	writeLine(out, "%s id=%v archivedAt=%v", action, task["id"], task["archivedAt"])
	return nil
}

func newTaskArchivedCmd(opts *Options) *cobra.Command {
	var projectID string
	cmd := &cobra.Command{
		Use:   "archived",
		Short: "列出项目已归档任务",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			var items []struct {
				ID         string  `json:"id"`
				Title      string  `json:"title"`
				Priority   string  `json:"priority"`
				ArchivedAt *string `json:"archivedAt"`
			}
			raw, err := c.DoRaw(context.Background(), "GET", "/api/projects/"+projectID+"/archived-tasks", nil, &items)
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if opts.JSON {
				return printRawJSON(out, raw)
			}
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				rows = append(rows, []string{item.ID, item.Title, item.Priority, optionalDisplay(item.ArchivedAt)})
			}
			return printTable(out, []string{"ID", "TITLE", "PRIORITY", "ARCHIVED_AT"}, rows)
		},
	}
	cmd.Flags().StringVar(&projectID, "project", "", "项目 ID")
	_ = cmd.MarkFlagRequired("project")
	return cmd
}

func newTaskDeleteCmd(opts *Options) *cobra.Command {
	return &cobra.Command{
		Use:   "delete <task-id>",
		Short: "删除任务",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := opts.newClient(true)
			if err != nil {
				return err
			}
			if _, err := c.DoRaw(context.Background(), "DELETE", "/api/tasks/"+args[0], nil, nil); err != nil {
				return err
			}
			writeLine(cmd.OutOrStdout(), "deleted id=%s", args[0])
			return nil
		},
	}
}

func optionalDisplay(v *string) string {
	if v == nil || *v == "" {
		return "—"
	}
	return *v
}

func parsePriority(v string) (string, error) {
	switch v {
	case "urgent", "high", "med", "low":
		return v, nil
	default:
		return "", fmt.Errorf("优先级必须是 urgent|high|med|low，收到 %q", v)
	}
}
