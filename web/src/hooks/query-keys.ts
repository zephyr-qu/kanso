// 前端 TanStack Query key 工厂与失效映射。
// 查询键、作用域规则和实时事件策略集中在此处，页面与领域 hook 不再依赖裸 key。
import type { QueryClient } from "@tanstack/react-query";
import { EVENT_TYPES } from "@/lib/events";

export const queryKeys = {
	workspaces: () => ["workspaces"] as const,
	me: () => ["me"] as const,
	members: (workspaceId: string) => ["members", workspaceId] as const,
	globalMembers: () => ["global-members"] as const,
	dashboard: (workspaceId: string) => ["dashboard", workspaceId] as const,
	projectsRoot: () => ["projects"] as const,
	projects: (workspaceId: string) => ["projects", workspaceId] as const,
	pinnedProjects: (workspaceId: string) => ["pinned-projects", workspaceId] as const,
	board: (projectId: string) => ["board", projectId] as const,
	task: (taskId: string) => ["task", taskId] as const,
	/** 仪表盘「需要关注」补齐项目名的辅助查询（真实后端不返回 projectName 时启用）。 */
	taskSource: (taskId: string) => ["task", taskId, "dashboard-source"] as const,
	tasks: () => ["task"] as const,
	taskSearch: (search: string) => ["task", "search", search] as const,
	archivedTasks: (projectId: string) => ["archived-tasks", projectId] as const,
	milestones: (projectId: string) => ["milestones", projectId] as const,
	milestoneTasks: (milestoneId: string) => ["milestone-tasks", milestoneId] as const,
	activities: (workspaceId: string) => ["activity", workspaceId] as const,
	calendar: (workspaceId: string) => ["calendar", workspaceId] as const,
};

export type ProjectScope = {
	projectId: string;
	workspaceId?: string;
};

function invalidateWorkspaceAggregates(
	queryClient: QueryClient,
	workspaceId?: string,
): void {
	if (workspaceId) {
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
		queryClient.invalidateQueries({ queryKey: queryKeys.calendar(workspaceId) });
		queryClient.invalidateQueries({ queryKey: queryKeys.activities(workspaceId) });
		return;
	}
	// 旧项目订阅只有 projectId 时无法反推出 workspaceId，保留前缀兜底，保证跨页收敛。
	queryClient.invalidateQueries({ queryKey: ["dashboard"] });
	queryClient.invalidateQueries({ queryKey: ["calendar"] });
	queryClient.invalidateQueries({ queryKey: ["activity"] });
}

/** 工作区聚合查询：用于工作区级事件和跨页面的成员/项目变更。 */
export function invalidateWorkspaceScope(
	queryClient: QueryClient,
	workspaceId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.calendar(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.activities(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.pinnedProjects(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
}

/** 工作区项目列表变化：同时刷新项目根前缀和当前工作区的置顶项目。 */
export function invalidateWorkspaceProjects(
	queryClient: QueryClient,
	workspaceId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.projectsRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.pinnedProjects(workspaceId) });
	invalidateWorkspaceAggregates(queryClient, workspaceId);
}

/** 工作区成员变化：成员列表、当前身份、工作区上下文和全局成员候选都可能变化。 */
export function invalidateWorkspaceMembers(
	queryClient: QueryClient,
	workspaceId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.me() });
	queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
	queryClient.invalidateQueries({ queryKey: queryKeys.globalMembers() });
}

/** 项目范围变化：看板、任务详情、项目辅助数据和工作区聚合页一起收敛。 */
export function invalidateProjectScope(
	queryClient: QueryClient,
	{ projectId, workspaceId }: ProjectScope,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
	queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.milestones(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.projectsRoot() });
	invalidateWorkspaceAggregates(queryClient, workspaceId);
}

/** 任务写入范围：只刷新任务相关查询，不波及里程碑列表。 */
export function invalidateTaskScope(
	queryClient: QueryClient,
	{ projectId, workspaceId, taskId }: ProjectScope & { taskId?: string },
): void {
	if (taskId) queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
	queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks(projectId) });
	invalidateWorkspaceAggregates(queryClient, workspaceId);
}

export function invalidatePinnedProjects(
	queryClient: QueryClient,
	workspaceId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.pinnedProjects(workspaceId) });
}

export function invalidateWorkspaces(queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
}

export function invalidateMe(queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.me() });
}

export function invalidateMilestoneTasks(
	queryClient: QueryClient,
	milestoneId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.milestoneTasks(milestoneId) });
}

export function invalidateMilestones(
	queryClient: QueryClient,
	projectId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.milestones(projectId) });
}

function invalidateProjectRealtimeEvent(
	queryClient: QueryClient,
	projectId: string,
	workspaceId: string | undefined,
	eventType: string,
): void {
	if (
		[
			EVENT_TYPES.projectCreated,
			EVENT_TYPES.projectUpdated,
			EVENT_TYPES.projectDeleted,
			EVENT_TYPES.projectPinned,
			EVENT_TYPES.projectUnpinned,
		].includes(eventType as never)
	) {
		invalidateProjectScope(queryClient, { projectId, workspaceId });
		if (workspaceId) invalidatePinnedProjects(queryClient, workspaceId);
		return;
	}

	if (
		[
			EVENT_TYPES.taskCreated,
			EVENT_TYPES.taskUpdated,
			EVENT_TYPES.taskMoved,
			EVENT_TYPES.taskDeleted,
			EVENT_TYPES.taskArchived,
			EVENT_TYPES.taskRestored,
			EVENT_TYPES.commentCreated,
			EVENT_TYPES.commentUpdated,
			EVENT_TYPES.commentDeleted,
		].includes(eventType as never)
	) {
		invalidateTaskScope(queryClient, { projectId, workspaceId });
		return;
	}

	// 列、标签、里程碑变更会改变看板或进度聚合；WS 消息不带实体 id，使用项目范围收敛。
	if (
		[
			EVENT_TYPES.milestoneCreated,
			EVENT_TYPES.milestoneUpdated,
			EVENT_TYPES.milestoneDeleted,
			EVENT_TYPES.milestoneAttached,
			EVENT_TYPES.milestoneDetached,
			EVENT_TYPES.columnCreated,
			EVENT_TYPES.columnUpdated,
			EVENT_TYPES.columnMoved,
			EVENT_TYPES.columnDeleted,
			EVENT_TYPES.labelCreated,
			EVENT_TYPES.labelUpdated,
			EVENT_TYPES.labelDeleted,
			EVENT_TYPES.labelAttached,
			EVENT_TYPES.labelDetached,
		].includes(eventType as never)
	) {
		invalidateProjectScope(queryClient, { projectId, workspaceId });
		return;
	}

	// 未知项目事件走安全兜底，避免新增后端事件造成页面静默陈旧。
	invalidateProjectScope(queryClient, { projectId, workspaceId });
}

/**
 * 实时事件的统一失效入口。
 * 已知事件走精确的查询集合；缺少作用域或备份导入时保留全量失效兜底。
 */
export function invalidateRealtimeEvent(
	queryClient: QueryClient,
	{
		scopeId,
		eventType,
		scope = "project",
		workspaceId,
	}: {
		scopeId: string | undefined;
		eventType: string;
		scope?: "project" | "workspace";
		workspaceId?: string;
	},
): void {
	if (!scopeId || eventType === EVENT_TYPES.backupImported) {
		queryClient.invalidateQueries();
		return;
	}

	if (scope === "workspace") {
		if (
			[
				EVENT_TYPES.memberCreated,
				EVENT_TYPES.memberUpdated,
				EVENT_TYPES.memberDeleted,
				EVENT_TYPES.memberKeyRotated,
				EVENT_TYPES.memberKeyRevoked,
			].includes(eventType as never)
		) {
			invalidateWorkspaceMembers(queryClient, scopeId);
			return;
		}
		if (
			[
				EVENT_TYPES.projectCreated,
				EVENT_TYPES.projectUpdated,
				EVENT_TYPES.projectDeleted,
			].includes(eventType as never)
		) {
			invalidateWorkspaceProjects(queryClient, scopeId);
			return;
		}
		if (
			[EVENT_TYPES.projectPinned, EVENT_TYPES.projectUnpinned].includes(
				eventType as never,
			)
		) {
			invalidatePinnedProjects(queryClient, scopeId);
			return;
		}
		if (
			[
				EVENT_TYPES.workspaceCreated,
				EVENT_TYPES.workspaceUpdated,
				EVENT_TYPES.workspaceDeleted,
			].includes(eventType as never)
		) {
			invalidateWorkspaceScope(queryClient, scopeId);
			queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
			return;
		}
		// 新增事件可能影响成员、项目或聚合数据，作用域已知时做安全的工作区级兜底。
		invalidateWorkspaceScope(queryClient, scopeId);
		queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
		queryClient.invalidateQueries({ queryKey: queryKeys.globalMembers() });
		return;
	}

	invalidateProjectRealtimeEvent(queryClient, scopeId, workspaceId, eventType);
}

// 仅看板（任务详情页不受影响）。
export function invalidateBoard(
	queryClient: QueryClient,
	projectId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
}

// 单个任务详情。
export function invalidateTask(queryClient: QueryClient, taskId: string): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
}
