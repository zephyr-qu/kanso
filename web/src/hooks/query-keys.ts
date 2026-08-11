// 前端 TanStack Query key 工厂与失效映射（架构候选 3）。
// key 形状与"事件源 → 失效哪些查询"的映射集中一处，避免裸字符串在各页漂移。
import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
	workspaces: () => ["workspaces"] as const,
	dashboard: () => ["dashboard"] as const,
	labels: (workspaceId: string) => ["labels", workspaceId] as const,
	projects: (workspaceId: string) => ["projects", workspaceId] as const,
	board: (projectId: string) => ["board", projectId] as const,
	task: (taskId: string) => ["task", taskId] as const,
	tasks: () => ["task"] as const,
	activities: () => ["activity"] as const,
};

// —— 失效映射 ——

// 看板数据变化：失效看板 + 全部任务详情（任务分布在看板内，WS 事件无法定位到具体任务）。
export function invalidateBoardScope(
	queryClient: QueryClient,
	projectId: string,
): void {
	queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
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
