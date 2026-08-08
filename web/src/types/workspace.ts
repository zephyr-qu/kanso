// 与 Go 后端 workspace 表对应的前端类型（ADR-0004：前端自行定义 API 类型）。
export type Workspace = {
	id: string;
	name: string;
	createdAt: string;
};
