// 事件动作常量与活动文案（候选 4）：与 Go 侧 internal/service/events.go 的常量对齐。
// ADR-0004 无共享类型包——两侧各自枚举，字符串值即合约。
export const EVENT_TYPES = {
	backupImported: "backup.imported",
	taskCreated: "task.created",
	taskUpdated: "task.updated",
	taskMoved: "task.moved",
	taskDeleted: "task.deleted",
	taskArchived: "task.archived",
	taskRestored: "task.restored",
	milestoneCreated: "milestone.created",
	milestoneUpdated: "milestone.updated",
	milestoneDeleted: "milestone.deleted",
	milestoneAttached: "milestone.attached",
	milestoneDetached: "milestone.detached",
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
	memberCreated: "member.created",
	memberUpdated: "member.updated",
	memberDeleted: "member.deleted",
	workspaceCreated: "workspace.created",
	workspaceUpdated: "workspace.updated",
	workspaceDeleted: "workspace.deleted",
	projectCreated: "project.created",
	projectUpdated: "project.updated",
	projectDeleted: "project.deleted",
	projectPinned: "project.pinned",
	projectUnpinned: "project.unpinned",
} as const;

// 活动 data 契约：按 action 键出形状（ADR-0006「字符串即合约」内——合约仍是字符串，这里是前端侧的类型化）。
// 只列真正携带 data 的动作；mock 记录端（recordActivity）与渲染端（activityDetail）共用，
// 漏字段/错字段在编译期报错。运行时 data 是 JSON 字符串、action 是兄弟字段，解析端仍宽松降级。
export type ActivityDataByAction = {
	[EVENT_TYPES.taskCreated]: { title: string };
	[EVENT_TYPES.taskUpdated]: { title: string };
	[EVENT_TYPES.taskMoved]: {
		from: string;
		to: string;
		fromName?: string;
		toName?: string;
	};
	[EVENT_TYPES.taskArchived]: { archivedAt: string | null; title: string };
	[EVENT_TYPES.taskRestored]: { archivedAt: string | null; title: string };
	[EVENT_TYPES.labelAttached]: { label: string };
	[EVENT_TYPES.labelDetached]: { label: string };
	[EVENT_TYPES.milestoneAttached]: {
		milestoneId: string;
		milestoneName?: string;
	};
	[EVENT_TYPES.milestoneDetached]: {
		milestoneId: string;
		milestoneName?: string;
	};
	[EVENT_TYPES.commentCreated]: { content: string };
	[EVENT_TYPES.commentDeleted]: { content: string };
	[EVENT_TYPES.columnCreated]: { name: string };
	[EVENT_TYPES.columnUpdated]: { name: string; wipLimit?: number | null };
	[EVENT_TYPES.columnMoved]: { name: string };
	[EVENT_TYPES.columnDeleted]: { name: string };
	[EVENT_TYPES.labelCreated]: { name: string };
	[EVENT_TYPES.labelUpdated]: { name: string };
	[EVENT_TYPES.labelDeleted]: { name: string };
	[EVENT_TYPES.milestoneCreated]: { name: string };
	[EVENT_TYPES.milestoneUpdated]: { name: string };
	[EVENT_TYPES.milestoneDeleted]: { name: string };
	[EVENT_TYPES.memberCreated]: { name: string };
	[EVENT_TYPES.memberUpdated]: { name: string };
	[EVENT_TYPES.memberDeleted]: { name: string };
	[EVENT_TYPES.workspaceCreated]: { name: string };
	[EVENT_TYPES.workspaceUpdated]: { name: string };
	[EVENT_TYPES.workspaceDeleted]: { name: string };
	[EVENT_TYPES.projectCreated]: { name: string };
	[EVENT_TYPES.projectUpdated]: { name: string };
	[EVENT_TYPES.projectDeleted]: { name: string };
	[EVENT_TYPES.projectPinned]: { name: string };
	[EVENT_TYPES.projectUnpinned]: { name: string };
};

// 活动流的动作文案（未识别动作回退显示原始字符串）。
// 与 Go 侧 internal/service/events.go 的事件动作字符串对齐；前端含全部动作文案（25 条）。
export const ACTION_LABELS: Record<string, string> = {
	[EVENT_TYPES.backupImported]: "导入了备份",
	[EVENT_TYPES.taskCreated]: "创建了任务",
	[EVENT_TYPES.taskUpdated]: "更新了任务",
	[EVENT_TYPES.taskMoved]: "移动了任务",
	[EVENT_TYPES.taskDeleted]: "删除了任务",
	[EVENT_TYPES.taskArchived]: "归档了任务",
	[EVENT_TYPES.taskRestored]: "恢复了任务",
	[EVENT_TYPES.milestoneCreated]: "创建了里程碑",
	[EVENT_TYPES.milestoneUpdated]: "更新了里程碑",
	[EVENT_TYPES.milestoneDeleted]: "删除了里程碑",
	[EVENT_TYPES.milestoneAttached]: "关联了里程碑",
	[EVENT_TYPES.milestoneDetached]: "移除了里程碑",
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
	[EVENT_TYPES.memberCreated]: "添加了成员",
	[EVENT_TYPES.memberUpdated]: "更新了成员",
	[EVENT_TYPES.memberDeleted]: "移除了成员",
	[EVENT_TYPES.workspaceCreated]: "创建了工作区",
	[EVENT_TYPES.workspaceUpdated]: "重命名了工作区",
	[EVENT_TYPES.workspaceDeleted]: "删除了工作区",
	[EVENT_TYPES.projectCreated]: "创建了项目",
	[EVENT_TYPES.projectUpdated]: "重命名了项目",
	[EVENT_TYPES.projectDeleted]: "删除了项目",
	[EVENT_TYPES.projectPinned]: "置顶了项目",
	[EVENT_TYPES.projectUnpinned]: "取消置顶项目",
};
