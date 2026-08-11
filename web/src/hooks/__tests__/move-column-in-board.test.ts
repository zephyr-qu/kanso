// moveColumnInBoard 纯函数测试：列重排、越界收敛、无效输入保持原样。
import { describe, expect, it } from "vitest";
import { moveColumnInBoard } from "@/hooks/use-board-data";
import type { Board } from "@/types/board";

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
				tasks: [],
			},
			{
				id: "c2",
				projectId: "p1",
				name: "进行中",
				position: 1,
				createdAt: "",
				tasks: [],
			},
			{
				id: "c3",
				projectId: "p1",
				name: "已完成",
				position: 2,
				createdAt: "",
				tasks: [],
			},
		],
	};
}

function ids(board: Board): string[] {
	return board.columns.map((c) => c.id);
}

describe("moveColumnInBoard", () => {
	it("把末尾列移到开头", () => {
		const result = moveColumnInBoard(makeBoard(), "c3", 0);
		expect(ids(result)).toEqual(["c3", "c1", "c2"]);
	});

	it("把首列移到末尾", () => {
		const result = moveColumnInBoard(makeBoard(), "c1", 2);
		expect(ids(result)).toEqual(["c2", "c3", "c1"]);
	});

	it("移到中间位置", () => {
		const result = moveColumnInBoard(makeBoard(), "c1", 1);
		expect(ids(result)).toEqual(["c2", "c1", "c3"]);
	});

	it("负数位置收敛到 0", () => {
		const result = moveColumnInBoard(makeBoard(), "c2", -10);
		expect(ids(result)).toEqual(["c2", "c1", "c3"]);
	});

	it("越界位置收敛到末尾", () => {
		const result = moveColumnInBoard(makeBoard(), "c2", 99);
		expect(ids(result)).toEqual(["c1", "c3", "c2"]);
	});

	it("列不存在时返回原看板", () => {
		const board = makeBoard();
		const result = moveColumnInBoard(board, "nope", 0);
		expect(result).toBe(board);
	});
});
