import { describe, expect, it } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
	invalidateBoardScope,
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
		invalidateBoardScope(client as unknown as QueryClient, "p1");

		expect(client.calls).toEqual([
			queryKeys.board("p1").join("/"),
			queryKeys.tasks().join("/"),
			queryKeys.archivedTasks("p1").join("/"),
			queryKeys.milestones("p1").join("/"),
			queryKeys.projectsRoot().join("/"),
			queryKeys.dashboard().join("/"),
			queryKeys.calendar().join("/"),
			queryKeys.activities().join("/"),
		]);
	});

	it("工作区事件和备份导入刷新全部查询", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, undefined, EVENT_TYPES.backupImported);
		invalidateRealtimeEvent(client as unknown as QueryClient, "p1", EVENT_TYPES.backupImported);
		invalidateRealtimeEvent(client as unknown as QueryClient, undefined, "unknown.event");

		expect(client.calls).toEqual(["*", "*", "*"]);
	});

	it("项目实时事件复用项目范围策略", () => {
		const client = queryClientSpy();
		invalidateRealtimeEvent(client as unknown as QueryClient, "p1", EVENT_TYPES.taskUpdated);

		expect(client.calls).toContain(queryKeys.board("p1").join("/"));
		expect(client.calls).toContain(queryKeys.dashboard().join("/"));
	});
});
