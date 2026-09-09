package cli

import (
	"context"
	"fmt"
	"io"

	"github.com/spf13/cobra"
)

// applyDueDateFlags 按 --due / --clear-due 写入 body["dueDate"]；
// clear-due 优先；两者都未设置时返回 false。
func applyDueDateFlags(cmd *cobra.Command, body map[string]any, due string, clearDue bool) bool {
	if clearDue {
		body["dueDate"] = ""
		return true
	}
	if cmd.Flags().Changed("due") {
		body["dueDate"] = due
		return true
	}
	return false
}

// mutateTaskRelation 贴上/撕掉任务与标签或里程碑的关联（204 无响应体）。
// collection 为路径段 labels|milestones；noun 用于人读确认（label|milestone）。
func mutateTaskRelation(opts *Options, out io.Writer, method, collection, noun, taskID, relatedID string) error {
	c, err := opts.newClient(true)
	if err != nil {
		return err
	}
	path := fmt.Sprintf("/api/tasks/%s/%s/%s", taskID, collection, relatedID)
	if _, err := c.DoRaw(context.Background(), method, path, nil, nil); err != nil {
		return err
	}
	action := "attached"
	if method == "DELETE" {
		action = "detached"
	}
	writeLine(out, "%s task=%s %s=%s", action, taskID, noun, relatedID)
	return nil
}
