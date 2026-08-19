// 置顶项目（后端 project.pinned 跨工作区返回，供侧边栏"置顶"分组消费；ADR-0009 每端点一类型）。
export type PinnedProject = {
	workspaceId: string;
	projectId: string;
	name: string;
};
