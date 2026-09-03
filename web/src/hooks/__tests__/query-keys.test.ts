import { describe, expect, it } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
	invalidateProjectScope,
	invalidateRealtimeEvent,
	queryKeys,
} from "@/hooks/query-keys";
import { EVENT_TYPES } from "@/lib/events";

type QueryClientSpy = {
	calls: string[];
	invalidateQueries: (filters?: { queryKey?: readonly unknown[] }) => Promise<void>;
};

function queryClientSpy(): QueryClientSpy {
	const calls: string[] = [];
	return {
		calls,
		invalidateQueries: (filters?: { queryKey?: readonly unknown[] }) => {
			calls.push(filters?.queryKey?.join("/") ?? "*");
			return Promise.resolve();
		},
	};
}

describe("query invalidation contract", () => {
	it("项目范围包含看板、详情、聚合页和活动流", () => {
		const client = queryClientSpy();
		invalidateProjectScope(client as unknown as QueryClient, { projectId: "p1" });

		expect(client.calls).toEqual([
			queryKeys.board("p1").join("/"),
			queryKeys.tasks().join("/"),
			queryKeys.archivedTasks("p1").join("/"),
			queryKeys.milestones("p1").join("/"),
			queryKeys.projectsRoot().join("/"),
			"dashboard",
			"calendar",
			"activity",
		]);
	});

	it("工作区事件和备份导入刷新全部查询", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: undefined,
			eventType: EVENT_TYPES.backupImported,
		});
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: "p1",
			eventType: EVENT_TYPES.backupImported,
		});
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: undefined,
			eventType: "unknown.event",
		});

		expect(client.calls).toEqual(["*", "*", "*"]);
	});

	it("项目实时事件复用项目范围策略", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: "p1",
			eventType: EVENT_TYPES.taskUpdated,
		});

		expect(client.calls).toContain(queryKeys.board("p1").join("/"));
		expect(client.calls).toContain("dashboard");
	});

	it("有工作区作用域的项目事件只刷新当前工作区聚合查询", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: "p1",
			workspaceId: "w1",
			eventType: EVENT_TYPES.taskUpdated,
		});

		expect(client.calls).toEqual([
			queryKeys.board("p1").join("/"),
			queryKeys.tasks().join("/"),
			queryKeys.archivedTasks("p1").join("/"),
			queryKeys.dashboard("w1").join("/"),
			queryKeys.calendar("w1").join("/"),
			queryKeys.activities("w1").join("/"),
		]);
	});

	it("工作区事件按事件类型选择最小查询集合", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: "w1",
			scope: "workspace",
			eventType: EVENT_TYPES.projectPinned,
		});
		expect(client.calls).toEqual([queryKeys.pinnedProjects("w1").join("/")]);

		client.calls.length = 0;
		invalidateRealtimeEvent(client as unknown as QueryClient, {
			scopeId: "w1",
			scope: "workspace",
			eventType: EVENT_TYPES.memberUpdated,
		});
		expect(client.calls).toEqual([
			queryKeys.members("w1").join("/"),
			queryKeys.me().join("/"),
			queryKeys.workspaces().join("/"),
			queryKeys.globalMembers().join("/"),
		]);
	});
});
