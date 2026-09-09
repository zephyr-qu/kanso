import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { queryKeys } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import {
	isWorkspaceRoute,
	projectIdFromPathname,
	resolveDisplayWorkspace,
	resolveWorkspace,
	workspaceDashboardPath,
	workspaceIdFromPathname,
	workspacePath,
} from "@/lib/workspace-context";
import { buildPath } from "@/lib/endpoints";
import type { WorkspaceResolution } from "@/lib/workspace-context";
import type { Workspace } from "@/types/workspace";

export type WorkspaceContextValue = {
	status: WorkspaceResolution["status"];
	requestedId: string | null;
	/** 当前工作区（含展示回退）：URL 无工作区段时回退最近活动工作区（无记忆则列表首个）。供侧边栏/切换器/浮动元素。 */
	currentWorkspace: Workspace | undefined;
	/** 当前工作区 id（与 currentWorkspace 同源）；无回退目标时为空串。 */
	currentWorkspaceId: string;
	/** URL 工作区已通过列表校验（路由权威）。展示回退值不得用于工作区路由跳转；唯一例外是 /app 首页重定向（RedirectHome 的既定语义：落到剩余/最近工作区）。 */
	isRouteAuthoritative: boolean;
	workspaces: Workspace[];
	currentProjectId: string | null;
	isHomeRedirect: boolean;
	workspaceDashboardPath: typeof workspaceDashboardPath;
	workspacePath: typeof workspacePath;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceContextProvider({
	children,
}: {
	children: ReactNode;
}) {
	const location = useLocation();
	const isHomeRedirect = location.pathname === "/app";
	// 始终拉取：/settings 等非工作区路由也需要工作区列表（此前按路由禁用导致
	// 点「系统设置」后侧边栏整体消失、看似空白工作区）。provider 只在登录壳内挂载。
	const workspacesQuery = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});
	// 查询状态收敛为原始值：配合下方 useMemo 稳定 resolution 引用，
	// 避免 context value 每 render 变化导致所有消费者重渲染。
	const queryState = workspacesQuery.isPending
		? "loading"
		: workspacesQuery.isError && !workspacesQuery.data
			? "error"
			: "success";
	const resolution = useMemo(
		() =>
			resolveWorkspace(
				location.pathname,
				workspacesQuery.data,
				// 有缓存数据时拉取失败不判死：换页/WS 重连都会触发 refetch，偶发失败若判死会把
				// 整个主区域换成「工作区不可用」死屏（实测复现）。缓存继续渲染，等待自愈。
				queryState,
			),
		[location.pathname, workspacesQuery.data, queryState],
	);
	const status =
		resolution.status === "not-required" && isHomeRedirect
			? queryState === "loading"
				? "loading"
				: queryState === "error"
					? "unavailable"
					: !workspacesQuery.data?.length
						? "empty"
						: "not-required"
			: resolution.status;
	// 「当前工作区」语义（收口点，2026-09-08 决策）：
	// 1. URL 工作区校验通过 → currentWorkspace 即解析结果，isRouteAuthoritative=true；
	// 2. URL 没有工作区段（/settings、/app 等）→ 展示回退最近一次活动工作区，无记忆
	//    则列表首个（侧边栏不能消失，但不得静默跳回默认工作区）；
	// 3. URL 工作区校验失败（被删/无权）→ 不回退，保持中性——「工作区不可用」是显式
	//    状态，禁止默认工作区静默覆盖（CONTEXT.md 导航上下文语言）。回退值仅供展示，
	//    路由跳转只认 isRouteAuthoritative 时的解析结果（唯一例外：/app 首页重定向）。
	// 最近一次活动工作区：点击导航必然发生在上一次提交的 effect 之后，时序安全。
	const lastActiveIdRef = useRef("");
	const readyWorkspaceId =
		resolution.status === "ready" ? resolution.workspace.id : "";
	useEffect(() => {
		if (readyWorkspaceId) lastActiveIdRef.current = readyWorkspaceId;
	}, [readyWorkspaceId]);
	const currentWorkspace = resolveDisplayWorkspace(
		resolution,
		workspacesQuery.data,
		lastActiveIdRef.current,
	);
	const currentWorkspaceId = currentWorkspace?.id ?? "";
	const isRouteAuthoritative = resolution.status === "ready";
	const value = useMemo<WorkspaceContextValue>(
		() => ({
			...resolution,
			status,
			workspaces: workspacesQuery.data ?? [],
			currentWorkspace,
			currentWorkspaceId,
			isRouteAuthoritative,
			currentProjectId:
				resolution.status === "ready"
					? projectIdFromPathname(location.pathname)
					: null,
			isHomeRedirect,
			workspaceDashboardPath,
			workspacePath,
		}),
		[
			location.pathname,
			isHomeRedirect,
			resolution,
			status,
			currentWorkspace,
			currentWorkspaceId,
			isRouteAuthoritative,
			workspacesQuery.data,
		],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspaceContext(): WorkspaceContextValue {
	const context = useContext(WorkspaceContext);
	if (!context) {
		throw new Error(
			"useWorkspaceContext must be used within WorkspaceContextProvider",
		);
	}
	return context;
}
