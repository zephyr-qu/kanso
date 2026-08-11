// 与 Go 后端 project 表对应的前端类型。
// 计数字段由 ListProjects 聚合返回（列表页 counts pills 用）；
// updatedAt 由后端提供（mock 层注入模拟值），前端直接消费。
export type Project = {
	id: string;
	workspaceId: string;
	name: string;
	position: number;
	createdAt: string;
	updatedAt: string;
	columnCount?: number;
	taskCount?: number;
	inProgressCount?: number;
};
