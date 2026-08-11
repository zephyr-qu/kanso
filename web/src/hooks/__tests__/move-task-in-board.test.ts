// moveTaskInBoard 纯函数测试：同列/跨列移动、越界收敛、无效输入保持原样。
import { describe, expect, it } from "vitest";
import { moveTaskInBoard } from "@/hooks/use-task-mutations";
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
				tasks: [t("t1", "c1", 0), t("t2", "c1", 1), t("t3", "c1", 2)],
			},
			{
				id: "c2",
				projectId: "p1",
				name: "进行中",
				position: 1,
				createdAt: "",
				tasks: [t("t4", "c2", 0)],
			},
		],
	};
}

function ids(board: Board, columnId: string): string[] {
	return board.columns.find((c) => c.id === columnId)!.tasks.map((x) => x.id);
}

describe("moveTaskInBoard", () => {
	it("同列移动：把末尾任务移到开头", () => {
		const result = moveTaskInBoard(makeBoard(), "t3", "c1", 0);
		expect(ids(result, "c1")).toEqual(["t3", "t1", "t2"]);
	});

	it("跨列移动：任务从 c1 移到 c2 的目标位置", () => {
		const result = moveTaskInBoard(makeBoard(), "t1", "c2", 1);
		expect(ids(result, "c1")).toEqual(["t2", "t3"]);
		expect(ids(result, "c2")).toEqual(["t4", "t1"]);
		// 被移任务更新所属列
		expect(result.columns.find((c) => c.id === "c2")!.tasks[1].columnId).toBe(
			"c2",
		);
	});

	it("越界位置收敛到列尾", () => {
		const result = moveTaskInBoard(makeBoard(), "t1", "c1", 99);
		expect(ids(result, "c1")).toEqual(["t2", "t3", "t1"]);
	});

	it("负数位置收敛到列首", () => {
		const result = moveTaskInBoard(makeBoard(), "t2", "c1", -5);
		expect(ids(result, "c1")).toEqual(["t2", "t1", "t3"]);
	});

	it("任务不存在时返回原看板", () => {
		const board = makeBoard();
		const result = moveTaskInBoard(board, "nope", "c1", 0);
		expect(result).toBe(board);
	});

	it("目标列不存在时返回原看板", () => {
		const board = makeBoard();
		const result = moveTaskInBoard(board, "t1", "nope", 0);
		expect(result).toBe(board);
	});

	it("不动其他列的引用与顺序", () => {
		const result = moveTaskInBoard(makeBoard(), "t1", "c2", 0);
		expect(ids(result, "c2")).toEqual(["t1", "t4"]);
	});
});
