// 应用壳：左侧导航框架（借鉴原型 rail：品牌块 + 工作区导航 + 底部退出）。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router";
import { PlusIcon } from "lucide-react";
import NameDialog from "@/components/name-dialog";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/query-keys";
import { useAuthStore } from "@/store/auth";
import type { Workspace } from "@/types/workspace";

export default function AppShell() {
	const logout = useAuthStore((s) => s.logout);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);

	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>("/api/workspaces"),
	});

	const createMutation = useMutation({
		mutationFn: (name: string) =>
			api<Workspace>("/api/workspaces", {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: (created) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
			navigate(`/w/${created.id}`);
		},
	});
	return (
		<>
		<div className="flex h-dvh">
			<aside className="flex w-[216px] shrink-0 flex-col border-r">
				{/* 品牌块：主色方块 mark + 字标 */}
				<div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-5">
					<span
						className="size-5 shrink-0 rounded-[5px] bg-primary shadow-[0_1px_3px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
						aria-hidden
					/>
					<span className="text-[15px] font-bold tracking-tight">Kanso</span>
				</div>

				<nav className="flex-1 overflow-auto px-3 pb-3 pt-[18px]">
					<p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
						总览
					</p>
					<NavLink
						to="/dashboard"
						className={({ isActive }) =>
							`block rounded-md border-l-2 py-[7px] pl-2.5 pr-2 text-sm transition-colors duration-150 ${
								isActive
									? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
									: "border-transparent text-sidebar-foreground hover:bg-muted"
							}`
						}
					>
						仪表盘
					</NavLink>
					<p className="mb-1.5 mt-[18px] px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
						工作区
					</p>
					<ul className="space-y-0.5">
						{workspaces?.map((workspace) => (
							<li key={workspace.id}>
								<NavLink
									to={`/w/${workspace.id}`}
									className={({ isActive }) =>
										`block rounded-md border-l-2 py-[7px] pl-2.5 pr-2 text-sm transition-colors duration-150 ${
											isActive
												? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
												: "border-transparent text-sidebar-foreground hover:bg-muted"
										}`
									}
								>
									{workspace.name}
								</NavLink>
							</li>
						))}
					</ul>
					<button
						type="button"
						className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2.5 py-[7px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={() => setCreateOpen(true)}
					>
						<PlusIcon className="size-3.5" /> 新建工作区
					</button>
					<p className="mb-1.5 mt-[18px] px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
						管理
					</p>
					<NavLink
						to="/activity"
						className={({ isActive }) =>
							`block rounded-md border-l-2 py-[7px] pl-2.5 pr-2 text-sm transition-colors duration-150 ${
								isActive
									? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
									: "border-transparent text-sidebar-foreground hover:bg-muted"
							}`
						}
					>
						活动
					</NavLink>
					<NavLink
						to="/settings"
						className={({ isActive }) =>
							`block rounded-md border-l-2 py-[7px] pl-2.5 pr-2 text-sm transition-colors duration-150 ${
								isActive
									? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
									: "border-transparent text-sidebar-foreground hover:bg-muted"
							}`
						}
					>
						设置
					</NavLink>
				</nav>

				<div className="border-t p-3">
					<button
						type="button"
						className="w-full rounded-md px-2 py-[7px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={logout}
					>
						退出登录
					</button>
				</div>
			</aside>

			<main className="flex-1 overflow-auto">
				<Outlet />
			</main>
		</div>
		<NameDialog
			open={createOpen}
			onOpenChange={setCreateOpen}
			title="新建工作区"
			description="为不同业务域建立独立工作区。"
			submitLabel="创建"
			onSubmit={async (name) => {
				await createMutation.mutateAsync(name);
			}}
		/>
		</>
	);
}
