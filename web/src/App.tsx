// 路由（react-router v7，library 模式）：/login 公开，其余路由经 RequireAuth 守卫。
// 守卫依据 zustand 登录态；401 事件（api.ts 广播）使登录态失效并重定向回登录页。
// "/" 由独立静态落地页承担（生产 Go embed / 开发 Vite middleware）；SPA 内再导航到 "/"
// 时做整页跳转，避免 React Router 接管营销页。
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

function ExitToLanding() {
	useLayoutEffect(() => {
		window.location.replace("/");
	}, []);
	return (
		<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
			加载中…
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
