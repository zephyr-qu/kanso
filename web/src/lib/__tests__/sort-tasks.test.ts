// sortTasks 纯函数测试：各排序字段与方向。
import { describe, expect, it } from "vitest";
import { sortTasks } from "@/lib/sort-tasks";
import type { Task } from "@/types/task";

function task(overrides: Partial<Task> & { id: string }): Task {
	return {
		projectId: "p1",
		columnId: "c1",
		title: "t",
		description: null,
		position: 0,
		createdAt: "2026-08-01T00:00:00Z",
		updatedAt: "2026-08-01T00:00:00Z",
		...overrides,
	};
}

describe("sortTasks", () => {
	it("position 字段保持原顺序（不改动）", () => {
		const tasks = [
			task({ id: "a", position: 2 }),
			task({ id: "b", position: 0 }),
		];
		expect(sortTasks(tasks, { field: "position", direction: "asc" })).toEqual(
			tasks,
		);
	});

	it("title 升序", () => {
		const tasks = [
			task({ id: "b", title: "beta" }),
			task({ id: "a", title: "alpha" }),
			task({ id: "g", title: "gamma" }),
		];
		const sorted = sortTasks(tasks, { field: "title", direction: "asc" });
		expect(sorted.map((t) => t.id)).toEqual(["a", "b", "g"]);
	});

	it("title 降序", () => {
		const tasks = [
			task({ id: "b", title: "beta" }),
			task({ id: "a", title: "alpha" }),
			task({ id: "g", title: "gamma" }),
		];
		const sorted = sortTasks(tasks, { field: "title", direction: "desc" });
		expect(sorted.map((t) => t.id)).toEqual(["g", "b", "a"]);
	});

	it("createdAt 升序", () => {
		const tasks = [
			task({ id: "later", createdAt: "2026-08-03T00:00:00Z" }),
			task({ id: "earlier", createdAt: "2026-08-01T00:00:00Z" }),
		];
		const sorted = sortTasks(tasks, { field: "createdAt", direction: "asc" });
		expect(sorted.map((t) => t.id)).toEqual(["earlier", "later"]);
	});


	it("不修改原数组", () => {
		const tasks = [
			task({ id: "b", title: "beta" }),
			task({ id: "a", title: "alpha" }),
		];
		sortTasks(tasks, { field: "title", direction: "asc" });
		expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
	});
});
