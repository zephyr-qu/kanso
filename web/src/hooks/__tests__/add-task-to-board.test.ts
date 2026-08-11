// addTaskToBoard 纯函数测试：追加到目标列末尾、其他列不受影响、不可变。
import { describe, expect, it } from "vitest";
import { addTaskToBoard } from "@/hooks/use-task-mutations";
import type { Board } from "@/types/board";
import type { Task } from "@/types/task";

function t(id: string, columnId: string, position: number): Task {
	return {
		id,
		projectId: "p1",
		columnId,
		title: id,
		description: null,
		position,
		createdAt: "",
		updatedAt: "",
	};
}

function makeBoard(): Board {
	return {
		project: {
			id: "p1",
			workspaceId: "w1",
			name: "P",
			position: 0,
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
		},
		labels: [],
		columns: [
			{
				id: "c1",
				projectId: "p1",
				name: "待办",
				position: 0,
				createdAt: "",
				tasks: [t("t1", "c1", 0)],
			},
			{
				id: "c2",
				projectId: "p1",
				name: "进行中",
				position: 1,
				createdAt: "",
				tasks: [],
			},
		],
	};
}

describe("addTaskToBoard", () => {
	it("新任务追加到目标列末尾", () => {
		const board = addTaskToBoard(makeBoard(), t("new", "c1", 99));
		const c1 = board!.columns.find((c) => c.id === "c1")!;
		expect(c1.tasks.map((x) => x.id)).toEqual(["t1", "new"]);
		expect(c1.tasks[1].position).toBe(99); // 保留服务端返回的 position
	});

	it("其他列不受影响", () => {
		const board = addTaskToBoard(makeBoard(), t("new", "c1", 1));
		const c2 = board!.columns.find((c) => c.id === "c2")!;
		expect(c2.tasks).toEqual([]);
	});

	it("不修改原看板（不可变）", () => {
		const before = makeBoard();
		addTaskToBoard(before, t("new", "c1", 1));
		expect(before.columns[0].tasks.map((x) => x.id)).toEqual(["t1"]);
		expect(before.columns[0].tasks).not.toContain("new");
	});

	it("目标列不存在时返回原看板", () => {
		const board = makeBoard();
		expect(addTaskToBoard(board, t("new", "nope", 0))).toBe(board);
	});

	it("看板未加载（undefined）时返回 undefined", () => {
		expect(addTaskToBoard(undefined, t("new", "c1", 0))).toBeUndefined();
	});
});
