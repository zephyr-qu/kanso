import type { Workspace } from "@/types/workspace";

export type WorkspaceResolution =
	| { status: "not-required"; requestedId: null; workspace: undefined }
	| { status: "loading"; requestedId: string | null; workspace: undefined }
	| { status: "ready"; requestedId: string; workspace: Workspace }
	| { status: "unavailable"; requestedId: string | null; workspace: undefined }
	| { status: "empty"; requestedId: null; workspace: undefined };

export function workspaceIdFromPathname(pathname: string): string | null {
	return pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
}

export function projectIdFromPathname(pathname: string): string | null {
	return pathname.match(/^\/w\/[^/]+\/p\/([^/]+)/)?.[1] ?? null;
}

export function isWorkspaceRoute(pathname: string): boolean {
	return pathname === "/w" || pathname.startsWith("/w/");
}

export function workspaceDashboardPath(workspaceId: string): string {
	return `/w/${workspaceId}/dashboard`;
}

export function workspacePath(workspaceId: string, suffix: string): string {
	return `/w/${workspaceId}/${suffix.replace(/^\/+/, "")}`;
}

export function resolveWorkspace(
	pathname: string,
	workspaces: Workspace[] | undefined,
	state: "loading" | "success" | "error",
): WorkspaceResolution {
	if (!isWorkspaceRoute(pathname)) {
		return { status: "not-required", requestedId: null, workspace: undefined };
	}

	const requestedId = workspaceIdFromPathname(pathname);
	if (state === "loading") {
		return { status: "loading", requestedId, workspace: undefined };
	}
	if (state === "error") {
		return { status: "unavailable", requestedId, workspace: undefined };
	}
	if (!workspaces?.length) {
		return { status: "empty", requestedId: null, workspace: undefined };
	}
	if (!requestedId) {
		return { status: "unavailable", requestedId: null, workspace: undefined };
	}

	const workspace = workspaces.find((item) => item.id === requestedId);
	return workspace
		? { status: "ready", requestedId, workspace }
		: { status: "unavailable", requestedId, workspace: undefined };
}

/**
 * 展示用「当前工作区」决策（CONTEXT.md 导航上下文语言）：
 * - URL 工作区校验通过 → 用解析结果；
 * - URL 无工作区段（/settings、/app 等）→ 回退最近一次活动工作区，
 *   无记忆或该工作区已不可访问时回退列表首个；
 * - URL 工作区校验失败（被删/无权）→ 不回退，保持中性——「工作区不可用」
 *   是显式状态，禁止默认工作区静默覆盖。回退值仅供展示，路由跳转只认
 *   isRouteAuthoritative 的解析结果。
 */
export function resolveDisplayWorkspace(
	resolution: WorkspaceResolution,
	workspaces: Workspace[] | undefined,
	lastActiveId: string,
): Workspace | undefined {
	if (resolution.workspace) return resolution.workspace;
	if (resolution.requestedId !== null) return undefined;
	return workspaces?.find((item) => item.id === lastActiveId) ?? workspaces?.[0];
}
