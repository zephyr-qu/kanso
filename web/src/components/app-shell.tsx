// 应用壳：左侧导航框架（借鉴原型 rail：品牌块 + 工作区导航 + 底部退出）。
// 全局浮动元素对齐原型 shell.jsx：⌘K 命令面板、Quick Capture FAB（Q 键）、底部键盘提示条。
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
	CalendarDaysIcon,
	GaugeIcon,
	HistoryIcon,
	LogOutIcon,
	PlusIcon,
	SettingsIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { MemberAvatar } from "@/components/member-avatar";
import NameDialog from "@/components/name-dialog";
import { QuickCapture, QuickCaptureFab } from "@/components/quick-capture";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { useAuthStore } from "@/store/auth";
import type { MeResponse } from "@/types/me";
import type { Workspace } from "@/types/workspace";

export default function AppShell() {
	const logout = useAuthStore((s) => s.logout);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const location = useLocation();
	const [createOpen, setCreateOpen] = useState(false);
	const [cmdOpen, setCmdOpen] = useState(false);
	const [qcOpen, setQcOpen] = useState(false);

	// 快捷键：⌘K/Ctrl+K 命令面板；Q 快速捕获（非输入场景，避免与打字冲突）。
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setCmdOpen((v) => !v);
				return;
			}
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase() ?? "";
			if (
				e.key.toLowerCase() === "q" &&
				tag !== "input" &&
				tag !== "textarea" &&
				tag !== "select" &&
				!target?.isContentEditable
			) {
				setQcOpen((v) => !v);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// 从当前 URL 解析项目 id（Quick Capture 默认落点）。仅匹配看板/任务详情路由。
	const currentProjectId = location.pathname.match(
		/^\/w\/[^/]+\/p\/([^/]+)/,
	)?.[1];
	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});
	const { data: meData } = useQuery({
		queryKey: queryKeys.me(),
		queryFn: () => api<MeResponse>(buildPath("me")),
	});
	const member = meData?.member;

	const createMutation = useMutation({
		mutationFn: (name: string) =>
			api<Workspace>(buildPath("workspaces"), {
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
		<div data-testid="app-shell" data-kanso-app className="kanso-shell">
			<aside data-testid="sidebar" className="kanso-sidebar">
				{/* 品牌块：主色方块 mark + 字标 */}
				<div data-testid="brand" className="kanso-brand">
					<span
						className="kanso-brand-mark"
						aria-hidden
					>
						簡
					</span>
					<span className="kanso-brand-name">Kanso</span>
				</div>

				<nav className="kanso-sidebar-nav">
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">总览</p>
					<NavLink
						to="/dashboard"
						className="kanso-sidebar-item"
					>
						<GaugeIcon />
						仪表盘
					</NavLink>
					<NavLink
						to="/calendar"
						className="kanso-sidebar-item"
					>
						<CalendarDaysIcon />
						日历
					</NavLink>
					</section>

					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">工作区</p>
					<ul>
						{workspaces?.map((workspace) => (
							<li key={workspace.id}>
								<NavLink
									to={`/w/${workspace.id}`}
									className="kanso-sidebar-item"
								>
									{workspace.name}
								</NavLink>
							</li>
						))}
					</ul>
					<button
						type="button"
						className="kanso-sidebar-item"
						onClick={() => setCreateOpen(true)}
					>
						<PlusIcon className="size-3.5" /> 新建工作区
					</button>
					</section>

					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">管理</p>
					<NavLink
						to="/activity"
						className="kanso-sidebar-item"
					>
						<HistoryIcon />
						活动
					</NavLink>
					<NavLink
						to="/settings"
						className="kanso-sidebar-item"
					>
						<SettingsIcon />
						设置
					</NavLink>
					</section>
				</nav>

				<div className="kanso-sidebar-footer">
					<NavLink
						to="/profile"
						aria-label="个人中心"
						title="个人中心"
						className="kanso-sidebar-identity"
					>
						{member ? (
							<MemberAvatar member={member} className="size-7 text-[11px] font-semibold text-white" />
						) : (
							<span className="size-7 rounded-full bg-muted" aria-hidden />
						)}
						<span className="min-w-0 flex-1 truncate">{member?.name ?? "未登录"}</span>
					</NavLink>
					<button
						type="button"
						aria-label="退出登录"
						title="退出登录"
						className="kanso-sidebar-logout"
						onClick={logout}
					>
						<LogOutIcon />
					</button>
				</div>
			</aside>

			<main data-testid="main-region" className="kanso-main">
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

		{/* 全局浮动元素（原型 shell）：FAB + 键盘提示条 + 命令面板 + 快速捕获 */}
		<QuickCaptureFab onClick={() => setQcOpen(true)} />
		<div
			className="kanso-keyboard-tip pointer-events-none fixed bottom-5 left-1/2 z-[85] -translate-x-1/2"
			aria-hidden
		>
			<span>
				<b className="mr-1 rounded-[4px] border bg-muted px-1.5 py-0.5 font-semibold text-foreground">
					⌘K
				</b>
				搜索
			</span>
			<span className="ml-3">
				<b className="mr-1 rounded-[4px] border bg-muted px-1.5 py-0.5 font-semibold text-foreground">
					Q
				</b>
				快速捕获
			</span>
		</div>

		<CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
		<QuickCapture
			open={qcOpen}
			onClose={() => setQcOpen(false)}
			defaultProjectId={currentProjectId}
		/>
		</>
	);
}
