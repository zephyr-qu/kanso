// 应用壳：左侧导航框架（借鉴原型 rail：品牌块 + 工作区导航 + 底部退出）。
// 全局浮动元素对齐原型 shell.jsx：⌘K 命令面板、Quick Capture FAB（Q 键）、底部键盘提示条。
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
	CalendarDaysIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	GaugeIcon,
	HistoryIcon,
	LayersIcon,
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
import { usePinnedProjects } from "@/lib/pinned-projects";
import { preloadRoute } from "@/lib/route-preload";
import {
	prefetchBoard,
	prefetchWorkspaceProjects,
} from "@/lib/query-prefetch";
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
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const routeIntentRef = useRef<{
		id: number;
		from: string;
		startMark: string;
	} | null>(null);
	const routeMeasureIdRef = useRef(0);
	const { items: pinnedProjects } = usePinnedProjects();

	// 开发环境记录“点击内部链接 → 下一帧”的路由耗时，便于在控制台和 Performance 面板定位卡顿来源。
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest<HTMLAnchorElement>("a[href]");
			if (!link || link.target === "_blank" || event.defaultPrevented) return;
			const url = new URL(link.href, window.location.href);
			if (url.origin !== window.location.origin || url.pathname === location.pathname) return;

			const id = ++routeMeasureIdRef.current;
			const startMark = `kanso-route-start-${id}`;
			performance.mark(startMark);
			routeIntentRef.current = {
				id,
				from: location.pathname,
				startMark,
			};
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, [location.pathname]);

	const previousPathRef = useRef(location.pathname);
	useEffect(() => {
		if (!import.meta.env.DEV) {
			previousPathRef.current = location.pathname;
			return;
		}
		const from = previousPathRef.current;
		const to = location.pathname;
		previousPathRef.current = to;
		if (from === to) return;

		const pending = routeIntentRef.current?.from === from
			? routeIntentRef.current
			: null;
		const id = pending?.id ?? ++routeMeasureIdRef.current;
		const startMark = pending?.startMark ?? `kanso-route-start-${id}`;
		if (!pending) performance.mark(startMark);
		const endMark = `kanso-route-paint-${id}`;
		const measureName = `kanso-route-${id}`;
		const frameId = window.requestAnimationFrame(() => {
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			const [measure] = performance.getEntriesByName(measureName);
			console.debug(
				`[kanso] route ${from} -> ${to}: ${Math.round(measure?.duration ?? 0)}ms`,
			);
			if (routeIntentRef.current?.id === id) routeIntentRef.current = null;
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [location.pathname]);

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
		meta: { feedback: { success: "工作区已创建", errorTitle: "创建工作区失败" } },
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
			<aside
				data-testid="sidebar"
				className={`kanso-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
			>
				{/* 品牌块：主色方块 mark + 字标 */}
				<div data-testid="brand" className="kanso-brand">
					<span
						className="kanso-brand-mark"
						aria-hidden
					>
						簡
					</span>
					<span className="kanso-brand-name">Kanso</span>
					<span className="kanso-brand-mode rounded-full border px-1.5 py-px text-[10px] leading-none text-muted-foreground">
						{meData?.mode === "team" ? "团队版" : "个人版"}
					</span>
					<button
						type="button"
						className="kanso-sidebar-toggle"
						data-testid="sidebar-toggle"
						aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
						aria-expanded={!sidebarCollapsed}
						aria-controls="kanso-sidebar-nav"
						title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
						onClick={() => setSidebarCollapsed((value) => !value)}
					>
						{sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
					</button>
				</div>

				<nav id="kanso-sidebar-nav" className="kanso-sidebar-nav">
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">总览</p>
					<NavLink
						to="/dashboard"
						className="kanso-sidebar-item"
						onMouseEnter={() => preloadRoute("dashboard")}
						onFocus={() => preloadRoute("dashboard")}
					>
						<GaugeIcon />
						<span className="kanso-sidebar-label">仪表盘</span>
					</NavLink>
					<NavLink
						to="/calendar"
						className="kanso-sidebar-item"
						onMouseEnter={() => preloadRoute("calendar")}
						onFocus={() => preloadRoute("calendar")}
					>
						<CalendarDaysIcon />
						<span className="kanso-sidebar-label">日历</span>
					</NavLink>
					</section>

					{pinnedProjects.length > 0 && (
						<section className="kanso-sidebar-group">
							<p className="kanso-sidebar-group-label">置顶</p>
							<ul>
								{pinnedProjects.map((p) => (
									<li key={p.projectId}>
												<NavLink
													to={`/w/${p.workspaceId}/p/${p.projectId}`}
																className="kanso-sidebar-item"
															onMouseEnter={() => {
															preloadRoute("board");
															prefetchBoard(queryClient, p.projectId);
														}}
															onFocus={() => {
															preloadRoute("board");
															prefetchBoard(queryClient, p.projectId);
														}}
												>
													<LayersIcon />
													<span className="kanso-sidebar-label">{p.name}</span>
										</NavLink>
									</li>
								))}
							</ul>
						</section>
						)}

					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">工作区</p>
					<ul>
						{workspaces?.map((workspace) => (
							<li key={workspace.id}>
														<NavLink
															to={`/w/${workspace.id}`}
																		className="kanso-sidebar-item"
																						onMouseEnter={() => {
																						preloadRoute("workspace");
																						prefetchWorkspaceProjects(queryClient, workspace.id);
																					}}
																						onFocus={() => {
																						preloadRoute("workspace");
																						prefetchWorkspaceProjects(queryClient, workspace.id);
																					}}
												>
													<LayersIcon />
													<span className="kanso-sidebar-label">{workspace.name}</span>
								</NavLink>
							</li>
						))}
					</ul>
					<button
						type="button"
						className="kanso-sidebar-item"
						onClick={() => setCreateOpen(true)}
					>
						<PlusIcon className="size-3.5" />
						<span className="kanso-sidebar-label">新建工作区</span>
					</button>
					</section>

					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">管理</p>
					<NavLink
						to="/activity"
						className="kanso-sidebar-item"
					>
						<HistoryIcon />
						<span className="kanso-sidebar-label">活动</span>
					</NavLink>
					<NavLink
						to="/settings"
						className="kanso-sidebar-item"
					>
						<SettingsIcon />
						<span className="kanso-sidebar-label">设置</span>
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
						<span className="kanso-sidebar-identity-label min-w-0 flex-1 truncate">{member?.name ?? "未登录"}</span>
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
