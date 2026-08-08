// 应用壳：左侧导航框架 + 内容区。导航列出工作区并链接到项目列表页。
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Workspace } from "@/types/workspace";

export default function AppShell() {
	const logout = useAuthStore((s) => s.logout);

	const { data: workspaces } = useQuery({
		queryKey: ["workspaces"],
		queryFn: () => api<Workspace[]>("/api/workspaces"),
	});

	return (
		<div className="flex h-dvh">
			<aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
				<div className="flex h-12 items-center gap-2 border-b px-4">
					<span className="font-semibold">Kanso</span>
				</div>
				<nav className="flex-1 space-y-1 overflow-auto p-2">
					<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
						工作区
					</div>
					{workspaces?.map((workspace) => (
						<NavLink
							key={workspace.id}
							to={`/w/${workspace.id}`}
							className={({ isActive }) =>
								`block rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
									isActive ? "bg-muted font-medium" : ""
								}`
							}
						>
							{workspace.name}
						</NavLink>
					))}
				</nav>
				<div className="border-t p-2">
					<Button
						variant="ghost"
						className="w-full justify-start text-sm"
						onClick={logout}
					>
						退出登录
					</Button>
				</div>
			</aside>
			<main className="flex-1 overflow-auto">
				<Outlet />
			</main>
		</div>
	);
}
