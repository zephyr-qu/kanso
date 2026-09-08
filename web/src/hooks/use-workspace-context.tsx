import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { queryKeys } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import {
	isWorkspaceRoute,
	projectIdFromPathname,
	resolveWorkspace,
	workspaceDashboardPath,
	workspaceIdFromPathname,
	workspacePath,
} from "@/lib/workspace-context";
import { buildPath } from "@/lib/endpoints";
import type { WorkspaceResolution } from "@/lib/workspace-context";
import type { Workspace } from "@/types/workspace";

export type WorkspaceContextValue = {
	status: WorkspaceResolution["status"];
	requestedId: string | null;
	workspace: Workspace | undefined;
	workspaces: Workspace[];
	workspaceId: string;
	workspaceIdFromUrl: string | null;
	currentProjectId: string | null;
	isReady: boolean;
	isHomeRedirect: boolean;
	workspaceDashboardPath: typeof workspaceDashboardPath;
	workspacePath: typeof workspacePath;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceContextProvider({
	children,
}: {
	children: ReactNode;
}) {
	const location = useLocation();
	const isHomeRedirect = location.pathname === "/app";
	const workspacesQuery = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
		enabled: isHomeRedirect || isWorkspaceRoute(location.pathname),
	});
	const resolution = resolveWorkspace(
		location.pathname,
		workspacesQuery.data,
		// 有缓存数据时拉取失败不判死：换页/WS 重连都会触发 refetch，偶发失败若判死会把
		// 整个主区域换成「工作区不可用」死屏（实测复现）。缓存继续渲染，等待自愈。
		workspacesQuery.isPending
			? "loading"
			: workspacesQuery.isError && !workspacesQuery.data
				? "error"
				: "success",
	);
	const status =
		resolution.status === "not-required" && isHomeRedirect
			? workspacesQuery.isPending
				? "loading"
				: workspacesQuery.isError || !workspacesQuery.data?.length
					? workspacesQuery.isError
						? "unavailable"
						: "empty"
					: "not-required"
			: resolution.status;
	const workspaceId =
		resolution.status === "ready" ? resolution.workspace.id : "";

	const value = useMemo<WorkspaceContextValue>(
		() => ({
			...resolution,
			status,
			workspaces: workspacesQuery.data ?? [],
			workspaceId,
			workspaceIdFromUrl: workspaceIdFromPathname(location.pathname),
			currentProjectId:
				resolution.status === "ready"
					? projectIdFromPathname(location.pathname)
					: null,
			isReady: resolution.status === "ready",
			isHomeRedirect,
			workspaceDashboardPath,
			workspacePath,
		}),
		[
			location.pathname,
			isHomeRedirect,
			resolution,
			status,
			workspaceId,
			workspacesQuery.data,
		],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspaceContext(): WorkspaceContextValue {
	const context = useContext(WorkspaceContext);
	if (!context) {
		throw new Error(
			"useWorkspaceContext must be used within WorkspaceContextProvider",
		);
	}
	return context;
}
