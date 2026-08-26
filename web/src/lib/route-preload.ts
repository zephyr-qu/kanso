// 路由模块预加载：鼠标悬停或空闲时提前拉取懒加载页面，点击后只需完成数据查询。
export const routeLoaders = {
	appShell: () => import("@/components/app-shell"),
	activity: () => import("@/pages/activity"),
	board: () => import("@/pages/board"),
	calendar: () => import("@/pages/calendar"),
	dashboard: () => import("@/pages/dashboard"),
	login: () => import("@/pages/login"),
	profile: () => import("@/pages/profile"),
	redirectHome: () => import("@/pages/redirect-home"),
	settings: () => import("@/pages/settings"),
	taskDetail: () => import("@/pages/task-detail"),
	workspace: () => import("@/pages/workspace"),
};

export type RouteName = keyof typeof routeLoaders;

export function preloadRoute(route: RouteName): void {
	void routeLoaders[route]();
}
