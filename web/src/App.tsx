// 路由（react-router v7，library 模式）：/login 公开，其余路由经 RequireAuth 守卫。
// 守卫依据 zustand 登录态；401 事件（api.ts 广播）使登录态失效并重定向回登录页。
// "/" 由完全独立的静态站点承担（apps/landing：单独构建、单独预览、单独部署，web 不再读取
// 它的任何文件）；SPA 内再导航到 "/" 时做整页跳转，避免 React Router 接管营销页。
// 落地页入口由 VITE_LANDING_URL 指定，默认同源根路径 "/"。
import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	RouterProvider,
	useLocation,
} from "react-router";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { routeLoaders } from "@/lib/route-preload";
import { useAuthStore } from "@/store/auth";

const AppShell = lazy(routeLoaders.appShell);
const ActivityPage = lazy(routeLoaders.activity);
const BoardPage = lazy(routeLoaders.board);
const CalendarPage = lazy(routeLoaders.calendar);
const DashboardPage = lazy(routeLoaders.dashboard);
const LoginPage = lazy(routeLoaders.login);
const WorkspaceSwitcherPrototype = lazy(routeLoaders.workspaceSwitcherPrototype);
const ProfilePage = lazy(routeLoaders.profile);
const RedirectHome = lazy(routeLoaders.redirectHome);
const SettingsPage = lazy(routeLoaders.settings);
const TeamPage = lazy(routeLoaders.team);
const TaskDetailPage = lazy(routeLoaders.taskDetail);
const WorkspacePage = lazy(routeLoaders.workspace);

// 落地页入口：独立站点，默认与 SPA 同源根路径；跨端口/跨域部署时用 VITE_LANDING_URL 指定。
const LANDING_URL: string = import.meta.env.VITE_LANDING_URL ?? "/";
// 开发时 Vite dev server 把 "/" 直接交给 SPA 承载，此刻再整页跳转 "/" 只会无限刷新：
// 入口仍是同源根路径时只提示、不跳转。生产 "/" 由独立站点承担，照常整页跳转。
const CAN_REDIRECT = !import.meta.env.DEV || LANDING_URL !== "/";

function ExitToLanding() {
	useLayoutEffect(() => {
		if (CAN_REDIRECT) window.location.replace(LANDING_URL);
	}, []);
	return (
		<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
			{CAN_REDIRECT
				? "正在返回落地页…"
				: "落地页是独立站点（apps/landing）：go run ./cmd/landing 可单独预览"}
		</div>
	);
}

function RequireAuth() {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const location = useLocation();

	useEffect(() => {
		const handler = () => useAuthStore.setState({ isAuthenticated: false });
		window.addEventListener(UNAUTHORIZED_EVENT, handler);
		return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
	}, []);

	if (!isAuthenticated) {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}
	return <Outlet />;
}

const router = createBrowserRouter([
	{ path: "/", element: <ExitToLanding /> },
	{ path: "/prototype/workspace-switcher", element: <WorkspaceSwitcherPrototype /> },
	{ path: "/login", element: <LoginPage /> },
	{
		element: <RequireAuth />,
		children: [
			{
				element: <AppShell />,
				children: [
					{ path: "app", element: <RedirectHome /> },
					{ path: "settings", element: <SettingsPage /> },
					{
						path: "w/:workspaceId",
						children: [
							{ index: true, element: <WorkspacePage /> },
							{ path: "dashboard", element: <DashboardPage /> },
							{ path: "calendar", element: <CalendarPage /> },
							{ path: "activity", element: <ActivityPage /> },
							{ path: "team", element: <TeamPage /> },
							{ path: "profile", element: <ProfilePage /> },
						],
					},
					{
						path: "w/:workspaceId/p/:projectId",
						element: <BoardPage />,
						children: [
							// 任务详情作为看板子路由：看板保留在背后，详情以右侧抽屉浮层呈现。
							{ path: "t/:taskId", element: <TaskDetailPage /> },
						],
					},
				],
			},
		],
	},
	{ path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
					加载中…
				</div>
			}
		>
			<RouterProvider router={router} />
		</Suspense>
	);
}
