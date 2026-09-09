import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
	useWorkspaceContext,
	WorkspaceContextProvider,
} from "@/hooks/use-workspace-context";
import { queryKeys } from "@/hooks/query-keys";

import {
	resolveDisplayWorkspace,
	resolveWorkspace,
} from "@/lib/workspace-context";
const workspaces = [
	{ id: "w1", name: "一号", createdAt: "" },
	{ id: "w2", name: "二号", createdAt: "" },
];

function Probe() {
	const context = useWorkspaceContext();
	return (
		<output>
			{JSON.stringify({
				status: context.status,
				currentWorkspaceId: context.currentWorkspaceId,
				currentWorkspaceName: context.currentWorkspace?.name ?? null,
				isRouteAuthoritative: context.isRouteAuthoritative,
				currentProjectId: context.currentProjectId,
				workspaceCount: context.workspaces.length,
			})}
		</output>
	);
}

function renderContext(
	pathname: string,
	cachedWorkspaces?: typeof workspaces,
): string {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	if (cachedWorkspaces) {
		queryClient.setQueryData(queryKeys.workspaces(), cachedWorkspaces);
	}
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[pathname]}>
				<WorkspaceContextProvider>
					<Probe />
				</WorkspaceContextProvider>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("WorkspaceContextProvider", () => {
	it("provides the URL workspace and project to child routes", () => {
		const html = renderContext("/w/w2/p/p9", workspaces);

		expect(html).toContain("&quot;status&quot;:&quot;ready&quot;");
		expect(html).toContain("&quot;currentWorkspaceId&quot;:&quot;w2&quot;");
		expect(html).toContain("&quot;currentWorkspaceName&quot;:&quot;二号&quot;");
		expect(html).toContain("&quot;isRouteAuthoritative&quot;:true");
		expect(html).toContain("&quot;currentProjectId&quot;:&quot;p9&quot;");
	});

	it("keeps an unavailable URL explicit instead of falling back", () => {
		const html = renderContext("/w/missing/dashboard", workspaces);

		expect(html).toContain("&quot;status&quot;:&quot;unavailable&quot;");
		// 校验失败的 URL 工作区不回退到默认工作区（禁止静默覆盖），保持中性空值。
		expect(html).toContain("&quot;currentWorkspaceId&quot;:&quot;&quot;");
		expect(html).toContain("&quot;currentWorkspaceName&quot;:null");
		expect(html).toContain("&quot;isRouteAuthoritative&quot;:false");
	});

	it("treats refetch error with cached data as ready, not unavailable", () => {
		// 点击导航/WS 重连会触发 refetch；偶发失败不应把主区域换成「工作区不可用」死屏。
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: Infinity } },
		});
		queryClient.setQueryData(queryKeys.workspaces(), workspaces);
		queryClient
			.getQueryCache()
			.find({ queryKey: queryKeys.workspaces() })
			?.setState({
				status: "error",
				fetchStatus: "idle",
				error: new Error("refetch failed"),
			});
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={["/w/w2/dashboard"]}>
					<WorkspaceContextProvider>
						<Probe />
					</WorkspaceContextProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(html).toContain("&quot;status&quot;:&quot;ready&quot;");
		expect(html).toContain("&quot;currentWorkspaceId&quot;:&quot;w2&quot;");
	});

	it("exposes loading and empty states from the shared query", () => {
		expect(renderContext("/w/w2/dashboard")).toContain(
			"&quot;status&quot;:&quot;loading&quot;",
		);
		expect(renderContext("/w/w2/dashboard", [])).toContain(
			"&quot;status&quot;:&quot;empty&quot;",
		);
	});

	it("falls back to the first workspace for display on non-workspace routes", () => {
		// /settings 等页面没有 URL 工作区段：侧边栏/切换器用列表首个兜底，路由权威为 false。
		const html = renderContext("/settings", workspaces);

		expect(html).toContain("&quot;currentWorkspaceId&quot;:&quot;w1&quot;");
		expect(html).toContain("&quot;currentWorkspaceName&quot;:&quot;一号&quot;");
		expect(html).toContain("&quot;isRouteAuthoritative&quot;:false");
	});

	it("shares the accessible list with the home redirect", () => {
		const html = renderContext("/app", workspaces);

		expect(html).toContain("&quot;status&quot;:&quot;not-required&quot;");
		expect(html).toContain("&quot;workspaceCount&quot;:2");
	});

	it("keeps /app usable on refetch error when cached workspaces exist", () => {
		// 与工作区路由同一约定：有缓存时偶发 refetch 失败不判 unavailable，
		// 否则登录后回 /app 会卡在「无法加载工作区」而不是用缓存列表跳转。
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: Infinity } },
		});
		queryClient.setQueryData(queryKeys.workspaces(), workspaces);
		queryClient
			.getQueryCache()
			.find({ queryKey: queryKeys.workspaces() })
			?.setState({
				status: "error",
				fetchStatus: "idle",
				error: new Error("refetch failed"),
			});
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={["/app"]}>
					<WorkspaceContextProvider>
						<Probe />
					</WorkspaceContextProvider>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(html).toContain("&quot;status&quot;:&quot;not-required&quot;");
		expect(html).toContain("&quot;workspaceCount&quot;:2");
	});
});

	describe("resolveDisplayWorkspace", () => {
		it("keeps the remembered active workspace on non-workspace routes", () => {
			// 从工作区二进入 /settings：展示回退应是 w2，而不是列表首个 w1。
			const settings = resolveWorkspace("/settings", workspaces, "success");
			expect(resolveDisplayWorkspace(settings, workspaces, "w2")?.id).toBe("w2");
		});

		it("falls back to the first workspace without memory", () => {
			const settings = resolveWorkspace("/settings", workspaces, "success");
			expect(resolveDisplayWorkspace(settings, workspaces, "")?.id).toBe("w1");
		});

		it("falls back to the first workspace when the remembered one disappeared", () => {
			const settings = resolveWorkspace("/settings", workspaces, "success");
			expect(resolveDisplayWorkspace(settings, workspaces, "gone")?.id).toBe("w1");
		});

		it("stays neutral when the URL workspace fails validation", () => {
			const missing = resolveWorkspace("/w/missing/dashboard", workspaces, "success");
			expect(
				resolveDisplayWorkspace(missing, workspaces, "w2"),
			).toBeUndefined();
		});

		it("prefers the URL workspace when validation passes", () => {
			const ready = resolveWorkspace("/w/w1/dashboard", workspaces, "success");
			expect(resolveDisplayWorkspace(ready, workspaces, "w2")?.id).toBe("w1");
		});
	});
