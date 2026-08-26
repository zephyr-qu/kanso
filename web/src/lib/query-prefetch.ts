// 路由进入前的数据预取：复用页面自身的 Query key，避免导航后重复请求。
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import type { Board } from "@/types/board";
import type { Project } from "@/types/project";

export function prefetchBoard(
	queryClient: QueryClient,
	projectId: string,
): void {
	if (!projectId) return;
	void queryClient.prefetchQuery({
		queryKey: queryKeys.board(projectId),
		queryFn: () => api<Board>(buildPath("project", { id: projectId })),
	});
}

export function prefetchWorkspaceProjects(
	queryClient: QueryClient,
	workspaceId: string,
): void {
	if (!workspaceId) return;
	void queryClient.prefetchQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () =>
			api<Project[]>(buildPath("workspaceProjects", { workspaceId })),
	});
}
