// 与 Go 后端 label 表对应的前端类型。
export type Label = {
	id: string;
	workspaceId: string;
	name: string;
	color: string;
	createdAt: string;
};

// 标签列表页摘要（含使用任务数；mock 聚合返回，对接后端后由真实端点提供）。
export type LabelSummary = Label & { taskCount: number };
