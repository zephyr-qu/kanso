// 全局搜索端点（/api/search）返回的任务命中（命令面板消费，mock search() 同款形状）。
// SearchHit 不继承基础 Task——搜索命中是拍平视图（含项目/工作区归属，不含描述等重字段）。
export type SearchHit = {
	id: string;
	title: string;
	columnId: string;
	priority: string;
	dueDate: string | null;
	projectId: string;
	projectName: string;
	workspaceId: string;
	workspaceName: string;
};
