// 前端 TanStack Query key 工厂与失效映射（架构候选 3）。
// key 形状与"事件源 → 失效哪些查询"的映射集中一处，避免裸字符串在各页漂移。
import type { QueryClient } from "@tanstack/react-query";
import { EVENT_TYPES } from "@/lib/events";

export const queryKeys = {
	workspaces: () => ["workspaces"] as const,
	me: () => ["me"] as const,
	members: (workspaceId: string) => ["members", workspaceId] as const,
	dashboard: () => ["dashboard"] as const,
	projectsRoot: () => ["projects"] as const,
	projects: (workspaceId: string) => ["projects", workspaceId] as const,
	board: (projectId: string) => ["board", projectId] as const,
	task: (taskId: string) => ["task", taskId] as const,
	/** 仪表盘「需要关注」补齐项目名的辅助查询（真实后端不返回 projectName 时启用）。 */
	taskSource: (taskId: string) => ["task", taskId, "dashboard-source"] as const,
	tasks: () => ["task"] as const,
	archivedTasks: (projectId: string) => ["archived-tasks", projectId] as const,
	milestones: (projectId: string) => ["milestones", projectId] as const,
	activities: () => ["activity"] as const,
	calendar: () => ["calendar"] as const,
};

// —— 失效映射 ——

// 看板数据变化：失效看板 + 全部任务详情（任务分布在看板内，WS 事件无法定位到具体任务）。
export function invalidateBoardScope(
	queryClient: QueryClient,
	projectId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
	queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.milestones(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.projectsRoot() });
	queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
	queryClient.invalidateQueries({ queryKey: queryKeys.calendar() });
	queryClient.invalidateQueries({ queryKey: queryKeys.activities() });
}

/**
 * 实时事件的统一失效入口。
 * 项目事件刷新当前项目范围；工作区事件或未知事件刷新全部查询，优先保证跨页收敛。
 */
export function invalidateRealtimeEvent(
	queryClient: QueryClient,
	projectId: string | undefined,
	eventType: string,
): void {
	if (!projectId || eventType === EVENT_TYPES.backupImported) {
		queryClient.invalidateQueries();
		return;
	}
	invalidateBoardScope(queryClient, projectId);
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
