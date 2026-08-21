// 路由（react-router v7，library 模式）：/login 公开，其余路由经 RequireAuth 守卫。
// 守卫依据 zustand 登录态；401 事件（api.ts 广播）使登录态失效并重定向回登录页。
import { lazy, Suspense, useEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	RouterProvider,
	useLocation,
} from "react-router";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const AppShell = lazy(() => import("@/components/app-shell"));
const ActivityPage = lazy(() => import("@/pages/activity"));
const BoardPage = lazy(() => import("@/pages/board"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const LoginPage = lazy(() => import("@/pages/login"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const RedirectHome = lazy(() => import("@/pages/redirect-home"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const TaskDetailPage = lazy(() => import("@/pages/task-detail"));
const WorkspacePage = lazy(() => import("@/pages/workspace"));

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
	{ path: "/login", element: <LoginPage /> },
	{
		element: <RequireAuth />,
		children: [
			{
				element: <AppShell />,
				children: [
					{ index: true, element: <RedirectHome /> },
					{ path: "dashboard", element: <DashboardPage /> },
					{ path: "calendar", element: <CalendarPage /> },
					{ path: "activity", element: <ActivityPage /> },
					{ path: "settings", element: <SettingsPage /> },
					{ path: "profile", element: <ProfilePage /> },
					{ path: "w/:workspaceId", element: <WorkspacePage /> },
					{ path: "w/:workspaceId/p/:projectId", element: <BoardPage /> },
					{
						path: "w/:workspaceId/p/:projectId/t/:taskId",
						element: <TaskDetailPage />,
					},
				],
			},
		],
	},
	{ path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
	return (
		<Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">加载中…</div>}>
			<RouterProvider router={router} />
		</Suspense>
	);
}
