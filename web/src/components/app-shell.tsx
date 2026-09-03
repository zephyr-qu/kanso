// 应用壳：左侧导航框架（借鉴原型 rail：品牌块 + 工作区导航 + 底部退出）。
// 全局浮动元素对齐原型 shell.jsx：⌘K 命令面板、Quick Capture FAB（Q 键）、底部键盘提示条。
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
	CalendarDaysIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	GaugeIcon,
	HistoryIcon,
	LayersIcon,
	LogOutIcon,
	PlusIcon,
		SettingsIcon,
		UsersIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { MemberAvatar } from "@/components/member-avatar";
import NameDialog from "@/components/name-dialog";
import { QuickCapture, QuickCaptureFab } from "@/components/quick-capture";
import { WorkspaceUnavailable } from "@/components/workspace-unavailable";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateWorkspaces, queryKeys } from "@/hooks/query-keys";
import {
	useWorkspaceContext,
	WorkspaceContextProvider,
} from "@/hooks/use-workspace-context";
import { usePinnedProjects } from "@/lib/pinned-projects";
import { preloadRoute } from "@/lib/route-preload";
import {
	prefetchBoard,
	prefetchWorkspaceProjects,
} from "@/lib/query-prefetch";
import { useAuthStore } from "@/store/auth";
import type { MeResponse } from "@/types/me";
import type { Project } from "@/types/project";
import type { Workspace } from "@/types/workspace";

function AppShellContent() {
	const logout = useAuthStore((s) => s.logout);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const location = useLocation();
	const [createOpen, setCreateOpen] = useState(false);
	const [cmdOpen, setCmdOpen] = useState(false);
	const [qcOpen, setQcOpen] = useState(false);
	const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const workspaceContext = useWorkspaceContext();
	const routeIntentRef = useRef<{
		id: number;
		from: string;
		startMark: string;
	} | null>(null);
	const routeMeasureIdRef = useRef(0);

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

	const { data: meData } = useQuery({
		queryKey: queryKeys.me(),
		queryFn: () => api<MeResponse>(buildPath("me")),
	});
	const member = meData?.member;
	const currentWorkspaceId = workspaceContext.workspaceId;
	const currentWorkspace = workspaceContext.workspace;
	const currentProjectId = workspaceContext.currentProjectId;
	const { workspaces } = workspaceContext;
	const { items: pinnedProjects } = usePinnedProjects(currentWorkspaceId);
	const { data: currentWorkspaceProjects } = useQuery({
		queryKey: queryKeys.projects(currentWorkspaceId),
		queryFn: () => api<Project[]>(buildPath("workspaceProjects", { workspaceId: currentWorkspaceId })),
		enabled: workspaceContext.isReady,
	});
	const createMutation = useMutation({
		meta: { feedback: { success: "工作区已创建", errorTitle: "创建工作区失败" } },
		mutationFn: (name: string) =>
			api<Workspace>(buildPath("workspaces"), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: (created) => {
			invalidateWorkspaces(queryClient);
			navigate(workspaceContext.workspaceDashboardPath(created.id));
		},
	});
	const canCreateWorkspace = member?.role === "admin";
	const unavailableStatus =
		workspaceContext.status === "loading"
			? "loading"
			: workspaceContext.status === "empty"
				? "empty"
				: "unavailable";
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

				{/* 原型：工作区是上下文切换器，不再作为项目分类平铺在导航中。 */}
				<div className={`kanso-workspace-switcher${workspaceMenuOpen ? " is-open" : ""}`}>
					<button
						type="button"
						className="kanso-workspace-switcher-trigger"
						aria-expanded={workspaceMenuOpen}
						aria-haspopup="menu"
						aria-label={`当前工作区：${currentWorkspace?.name ?? "未选择"}`}
						onClick={() => setWorkspaceMenuOpen((open) => !open)}
					>
						<span className="kanso-workspace-switcher-icon" aria-hidden="true">{currentWorkspace?.name?.slice(0, 1) ?? "·"}</span>
						<span className="kanso-workspace-switcher-copy">
							<span className="kanso-workspace-switcher-label">当前工作区</span>
							<strong>{currentWorkspace?.name ?? "选择工作区"}</strong>
						</span>
						<ChevronDownIcon className="kanso-workspace-switcher-chevron" />
					</button>
					{workspaceMenuOpen ? (
						<div className="kanso-workspace-switcher-menu" role="menu" aria-label="切换工作区">
							<div className="kanso-workspace-switcher-menu-label">切换工作区</div>
							{(workspaces ?? []).map((workspace) => (
								<NavLink
									key={workspace.id}
									to={workspaceContext.workspaceDashboardPath(workspace.id)}
									role="menuitem"
									className={`kanso-workspace-switcher-option${workspace.id === currentWorkspaceId ? " is-current" : ""}`}
									onClick={() => setWorkspaceMenuOpen(false)}
								>
									<span className="kanso-workspace-option-dot" aria-hidden="true">{workspace.name.slice(0, 1)}</span>
									<span className="kanso-workspace-option-name">{workspace.name}</span>
									{workspace.id === currentWorkspaceId ? <span className="kanso-workspace-option-check">✓</span> : null}
								</NavLink>
							))}
							<div className="kanso-workspace-switcher-divider" />
							{canCreateWorkspace ? (
								<button
									type="button"
									className="kanso-workspace-switcher-create"
									onClick={() => { setWorkspaceMenuOpen(false); setCreateOpen(true); }}
								>
									<PlusIcon />
									新建工作区
								</button>
							) : null}
						</div>
					) : null}
				</div>

				<nav id="kanso-sidebar-nav" className="kanso-sidebar-nav">
					{workspaceContext.isReady ? (
						<>
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">总览</p>
					<NavLink
						to={workspaceContext.workspacePath(currentWorkspaceId, "dashboard")}
						className="kanso-sidebar-item"
						onMouseEnter={() => preloadRoute("dashboard")}
						onFocus={() => preloadRoute("dashboard")}
					>
						<GaugeIcon />
						<span className="kanso-sidebar-label">仪表盘</span>
					</NavLink>
					<NavLink
						to={workspaceContext.workspacePath(currentWorkspaceId, "calendar")}
						className="kanso-sidebar-item"
						onMouseEnter={() => preloadRoute("calendar")}
						onFocus={() => preloadRoute("calendar")}
					>
						<CalendarDaysIcon />
						<span className="kanso-sidebar-label">日历</span>
					</NavLink>
					<NavLink
						to={`/w/${currentWorkspaceId}`}
						end
						className="kanso-sidebar-item"
						onMouseEnter={() => {
							preloadRoute("workspace");
							prefetchWorkspaceProjects(queryClient, currentWorkspaceId);
						}}
						onFocus={() => {
							preloadRoute("workspace");
							prefetchWorkspaceProjects(queryClient, currentWorkspaceId);
						}}
					>
						<LayersIcon />
						<span className="kanso-sidebar-label">项目</span>
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
						<p className="kanso-sidebar-group-label">看板</p>
						<ul>
							{currentWorkspaceProjects?.map((project) => (
								<li key={project.id}>
									<NavLink
										to={`/w/${currentWorkspaceId}/p/${project.id}`}
										className="kanso-sidebar-item"
										onMouseEnter={() => {
											preloadRoute("board");
											prefetchBoard(queryClient, project.id);
										}}
										onFocus={() => {
											preloadRoute("board");
											prefetchBoard(queryClient, project.id);
										}}
									>
											<LayersIcon />
										<span className="kanso-sidebar-label">{project.name}</span>
									</NavLink>
								</li>
							))}
						</ul>
					</section>

					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">管理</p>
					<NavLink
					to={workspaceContext.workspacePath(currentWorkspaceId, "activity")}
						className="kanso-sidebar-item"
					>
						<HistoryIcon />
						<span className="kanso-sidebar-label">活动</span>
					</NavLink>
					{meData?.mode === "team" ? (
						<NavLink
							to={workspaceContext.workspacePath(currentWorkspaceId, "team")}
							className="kanso-sidebar-item"
							onMouseEnter={() => preloadRoute("team")}
							onFocus={() => preloadRoute("team")}
						>
							<UsersIcon />
							<span className="kanso-sidebar-label">团队</span>
						</NavLink>
					) : null}
					</section>
						</>
					) : null}
					{member?.role === "admin" ? (
						<section className="kanso-sidebar-group">
							<p className="kanso-sidebar-group-label">管理</p>
							<NavLink to="/settings" className="kanso-sidebar-item">
								<SettingsIcon />
								<span className="kanso-sidebar-label">系统设置</span>
							</NavLink>
						</section>
					) : null}
				</nav>

			<div className="kanso-sidebar-footer">
					{workspaceContext.isReady ? (
						<NavLink
							to={workspaceContext.workspacePath(currentWorkspaceId, "profile")}
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
					) : (
						<div className="kanso-sidebar-identity" aria-label="个人中心">
							{member ? (
								<MemberAvatar member={member} className="size-7 text-[11px] font-semibold text-white" />
							) : (
								<span className="size-7 rounded-full bg-muted" aria-hidden />
							)}
							<span className="kanso-sidebar-identity-label min-w-0 flex-1 truncate">{member?.name ?? "未登录"}</span>
						</div>
					)}
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

			<main
				data-testid="main-region"
				className="kanso-main"
			>
				{workspaceContext.isReady || workspaceContext.status === "not-required" ? (
					<Outlet />
				) : (
					<WorkspaceUnavailable
						status={unavailableStatus}
						canCreate={canCreateWorkspace}
						onCreate={() => setCreateOpen(true)}
						onChoose={() => setWorkspaceMenuOpen(true)}
					/>
				)}
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
		{workspaceContext.isReady ? (
			<QuickCaptureFab onClick={() => setQcOpen(true)} />
		) : null}
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

		<CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} workspaceId={currentWorkspaceId} canManage={member?.role === "admin"} />
		{workspaceContext.isReady ? (
			<QuickCapture
				open={qcOpen}
				onClose={() => setQcOpen(false)}
				defaultProjectId={currentProjectId}
				workspaceId={currentWorkspaceId}
				workspaceName={currentWorkspace?.name}
			/>
		) : null}
		</>
	);
}

export default function AppShell() {
	return (
		<WorkspaceContextProvider>
			<AppShellContent />
		</WorkspaceContextProvider>
	);
}
