// "/" 首页：加载工作区列表并重定向到第一个工作区（单用户场景默认只有一个）。
import { Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/query-keys";
import type { Workspace } from "@/types/workspace";

export default function RedirectHome() {
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>("/api/workspaces"),
	});

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	if (isError || !data || data.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-destructive">
				无法加载工作区
			</div>
		);
	}
	return <Navigate to={`/w/${data[0].id}`} replace />;
}
