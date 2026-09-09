// "/" 首页：加载工作区列表并重定向到第一个工作区（单用户场景默认只有一个）。
import { Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import type { MeResponse } from "@/types/me";

export default function RedirectHome() {
	const { workspaces, status, currentWorkspaceId, workspaceDashboardPath } =
		useWorkspaceContext();
	const { data: me } = useQuery({
		queryKey: queryKeys.me(),
		queryFn: () => api<MeResponse>(buildPath("me")),
	});

	if (status === "loading") {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	if (
		status === "unavailable" ||
		status === "empty" ||
		workspaces.length === 0
	) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-destructive">
				{me?.member.role === "member" ? "等待管理员授权工作区" : "无法加载工作区"}
			</div>
		);
	}
	return <Navigate to={workspaceDashboardPath(currentWorkspaceId)} replace />;
}
