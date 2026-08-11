// 事件动作常量与活动文案（候选 4）：与 Go 侧 internal/service/events.go 的常量对齐。
// ADR-0004 无共享类型包——两侧各自枚举，字符串值即合约。
export const EVENT_TYPES = {
	taskCreated: "task.created",
	taskUpdated: "task.updated",
	taskMoved: "task.moved",
	taskDeleted: "task.deleted",
	columnCreated: "column.created",
	columnUpdated: "column.updated",
	columnMoved: "column.moved",
	columnDeleted: "column.deleted",
	labelCreated: "label.created",
	labelUpdated: "label.updated",
	labelDeleted: "label.deleted",
	labelAttached: "label.attached",
	labelDetached: "label.detached",
	commentCreated: "comment.created",
	commentDeleted: "comment.deleted",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// 活动流的动作文案（未识别动作回退显示原始字符串）。
// 与 Go 侧 internal/service/dashboard.go 的 actionLabels 对齐（15 条）。
export const ACTION_LABELS: Record<string, string> = {
	[EVENT_TYPES.taskCreated]: "创建了任务",
	[EVENT_TYPES.taskUpdated]: "更新了任务",
	[EVENT_TYPES.taskMoved]: "移动了任务",
	[EVENT_TYPES.taskDeleted]: "删除了任务",
	[EVENT_TYPES.columnCreated]: "创建了列",
	[EVENT_TYPES.columnUpdated]: "重命名了列",
	[EVENT_TYPES.columnMoved]: "移动了列",
	[EVENT_TYPES.columnDeleted]: "删除了列",
	[EVENT_TYPES.labelCreated]: "创建了标签",
	[EVENT_TYPES.labelUpdated]: "重命名了标签",
	[EVENT_TYPES.labelDeleted]: "删除了标签",
	[EVENT_TYPES.labelAttached]: "贴了标签",
	[EVENT_TYPES.labelDetached]: "移除了标签",
	[EVENT_TYPES.commentCreated]: "发表了评论",
	[EVENT_TYPES.commentDeleted]: "删除了评论",
};
