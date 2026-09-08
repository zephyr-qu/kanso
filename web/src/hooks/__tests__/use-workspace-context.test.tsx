import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
	useWorkspaceContext,
	WorkspaceContextProvider,
} from "@/hooks/use-workspace-context";
import { queryKeys } from "@/hooks/query-keys";

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
				workspaceId: context.workspaceId,
				workspaceName: context.workspace?.name ?? null,
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
		expect(html).toContain("&quot;workspaceId&quot;:&quot;w2&quot;");
		expect(html).toContain("&quot;workspaceName&quot;:&quot;二号&quot;");
		expect(html).toContain("&quot;currentProjectId&quot;:&quot;p9&quot;");
	});

	it("keeps an unavailable URL explicit instead of falling back", () => {
		const html = renderContext("/w/missing/dashboard", workspaces);

		expect(html).toContain("&quot;status&quot;:&quot;unavailable&quot;");
		expect(html).toContain("&quot;workspaceId&quot;:&quot;&quot;");
		expect(html).toContain("&quot;workspaceName&quot;:null");
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
		expect(html).toContain("&quot;workspaceId&quot;:&quot;w2&quot;");
	});

	it("exposes loading and empty states from the shared query", () => {
		expect(renderContext("/w/w2/dashboard")).toContain(
			"&quot;status&quot;:&quot;loading&quot;",
		);
		expect(renderContext("/w/w2/dashboard", [])).toContain(
			"&quot;status&quot;:&quot;empty&quot;",
		);
	});

	it("shares the accessible list with the home redirect", () => {
		const html = renderContext("/app", workspaces);

		expect(html).toContain("&quot;status&quot;:&quot;not-required&quot;");
		expect(html).toContain("&quot;workspaceCount&quot;:2");
	});
});
