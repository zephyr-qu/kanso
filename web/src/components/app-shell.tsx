// 应用壳：左侧导航框架 + 内容区。当前导航为占位（工作区入口由后续切片接入）。
import { Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";

export default function AppShell() {
	const logout = useAuthStore((s) => s.logout);

	return (
		<div className="flex h-dvh">
			<aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
				<div className="flex h-12 items-center gap-2 border-b px-4">
					<span className="font-semibold">Kanso</span>
				</div>
				<nav className="flex-1 space-y-1 p-2">
					<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">工作区</div>
					<button
						type="button"
						className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
						disabled
					>
						默认工作区（待接入）
					</button>
				</nav>
				<div className="border-t p-2">
					<Button variant="ghost" className="w-full justify-start text-sm" onClick={logout}>
						退出登录
					</Button>
				</div>
			</aside>
			<main className="flex-1 overflow-auto">
				<Outlet />
			</main>
		</div>
	);
}
