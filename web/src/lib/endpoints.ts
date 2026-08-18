// 端点面单一来源（架构候选 4）：路径模板表。
// 前端用 buildPath 填充 :param 得请求路径；Mock 用 mswPattern 派生路由（* + 模板）。
// 改路由只需改这里一处；「前端已消费 vs mock 已注册」的漂移在编译/对账层面暴露。
// 注：/api/settings/backup（settingsBackup）暂为「契约已定义、UI 未做」，保留待用。
export const ENDPOINT_TEMPLATES = {
	// 认证与身份
	authVerify: "/api/auth/verify",
	me: "/api/me",
	// 工作区
	workspaces: "/api/workspaces",
	workspace: "/api/workspaces/:id",
	workspaceProjects: "/api/workspaces/:workspaceId/projects",
	workspaceMembers: "/api/workspaces/:id/members",
	// 成员
	members: "/api/members",
	member: "/api/members/:id",
	memberKey: "/api/members/:id/key",
	// 项目
	project: "/api/projects/:id",
	projectArchivedTasks: "/api/projects/:id/archived-tasks",
	projectColumns: "/api/projects/:projectId/columns",
	projectLabels: "/api/projects/:projectId/labels",
	projectMilestones: "/api/projects/:id/milestones",
	// 列与任务
	column: "/api/columns/:id",
	columnTasks: "/api/columns/:columnId/tasks",
	task: "/api/tasks/:id",
	taskArchive: "/api/tasks/:id/archive",
	taskRestore: "/api/tasks/:id/restore",
	taskComments: "/api/tasks/:id/comments",
	taskLabels: "/api/tasks/:taskId/labels/:labelId",
	taskMilestones: "/api/tasks/:taskId/milestones/:milestoneId",
	// 评论 / 标签 / 里程碑
	comment: "/api/comments/:id",
	label: "/api/labels/:id",
	milestone: "/api/milestones/:id",
	milestoneTasks: "/api/milestones/:id/tasks",
	// 汇总与检索
	dashboard: "/api/dashboard",
	activity: "/api/activity",
	search: "/api/search",
	health: "/api/health",
	settingsBackup: "/api/settings/backup",
	settingsConfig: "/api/settings/config",
} as const;

export type EndpointName = keyof typeof ENDPOINT_TEMPLATES;

/** 前端请求路径：按名取模板并填充 :param（未提供的参数替换为空串）。 */
export function buildPath<E extends EndpointName>(
	name: E,
	params: Record<string, string> = {},
): string {
	return ENDPOINT_TEMPLATES[name].replace(
		/:(\w+)/g,
		(_, key: string) => params[key] ?? "",
	);
}

/** Mock 路由模式：与前端同一模板，加 * 通配前缀（MSW 跨 origin 匹配）。 */
export function mswPattern<E extends EndpointName>(name: E): string {
	return `*${ENDPOINT_TEMPLATES[name]}`;
}
