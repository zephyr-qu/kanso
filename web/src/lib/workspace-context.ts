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
