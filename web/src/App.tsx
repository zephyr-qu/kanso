// 路由（react-router v7，library 模式）：/login 公开，其余路由经 RequireAuth 守卫。
// 守卫依据 zustand 登录态；401 事件（api.ts 广播）使登录态失效并重定向回登录页。
import { useEffect } from "react";
import {
	createBrowserRouter,
	Navigate,
	Outlet,
	RouterProvider,
	useLocation,
} from "react-router";
import AppShell from "@/components/app-shell";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import BoardPage from "@/pages/board";
import LoginPage from "@/pages/login";
import RedirectHome from "@/pages/redirect-home";
import WorkspacePage from "@/pages/workspace";
import { useAuthStore } from "@/store/auth";

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
					{ path: "w/:workspaceId", element: <WorkspacePage /> },
					{ path: "w/:workspaceId/p/:projectId", element: <BoardPage /> },
				],
			},
		],
	},
	{ path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
	return <RouterProvider router={router} />;
}
