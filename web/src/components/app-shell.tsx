// 应用壳：左侧导航框架 + 内容区。品牌块 + 工作区导航（发丝细线列表）。
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
			<aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
				<div className="flex h-14 items-center gap-3 border-b px-4">
					<span className="seal !size-8 !text-sm">簡</span>
					<span className="wordmark text-xs">Kanso</span>
				</div>
				<nav className="flex-1 overflow-auto p-2">
					<p className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground/70">
						Workspace
					</p>
					{workspaces?.map((workspace) => (
						<NavLink
							key={workspace.id}
							to={`/w/${workspace.id}`}
							className={({ isActive }) =>
								`block rounded-[3px] px-2 py-1.5 text-sm ${
									isActive
										? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
										: "text-sidebar-foreground hover:bg-sidebar-accent/60"
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
