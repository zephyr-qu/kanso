// 看板拖拽状态机测试：核心解析 + 回归（泳道列维度、跨列落点、同列 no-op、dragend 提交计划）。
import { describe, expect, it } from "vitest";
import {
	dragTransition,
	initialDragState,
	type DragAction,
	type DragEvent,
	type DragViewMode,
	type OverType,
} from "@/hooks/use-board-drag";
import type { Board } from "@/types/board";
import type { Task } from "@/types/task";

function makeTask(
	id: string,
	columnId: string,
	position: number,
	labelIds: string[] = [],
): Task {
	return {
		id,
		projectId: "p1",
		columnId,
		title: id,
		description: null,
		position,
		createdAt: "",
		updatedAt: "",
		labels: labelIds.map((labelId) => ({
			id: labelId,
			projectId: "p1",
			name: labelId,
			createdAt: "",
		})),
	};
}

function fixtureBoard(): Board {
	return {
		project: {
			id: "p1",
			workspaceId: "w1",
			name: "项目",
			position: 0,
			createdAt: "",
			updatedAt: "",
		},
		labels: [
			{ id: "l1", projectId: "p1", name: "前端", createdAt: "" },
			{ id: "l2", projectId: "p1", name: "后端", createdAt: "" },
		],
		columns: [
			{
				id: "c1",
				projectId: "p1",
				name: "待办",
				position: 0,
				createdAt: "",
				wipLimit: null,
				tasks: [makeTask("t1", "c1", 0), makeTask("t2", "c1", 1)],
			},
			{
				id: "c2",
				projectId: "p1",
				name: "进行中",
				position: 1,
				createdAt: "",
				wipLimit: null,
				tasks: [makeTask("t3", "c2", 0)],
			},
		],
	};
}

function swimFixture(): Board {
	const board = fixtureBoard();
	board.columns[0].tasks[0] = makeTask("t1", "c1", 0, ["l1"]); // 前端泳道
	board.columns[1].tasks[0] = makeTask("t3", "c2", 0, ["l2"]); // 后端泳道
	return board;
}

function act(
	event: DragEvent,
	board: Board,
	viewMode: DragViewMode = "columns",
) {
	return dragTransition(initialDragState, {
		event,
		ctx: { board, viewMode },
	} satisfies DragAction);
}

const over = (activeId: string, overId: string, overType: OverType = "task", halfPassed = false) =>
	({ type: "over", activeId, overId, overType, halfPassed }) as const;
const end = (activeId: string, overId: string, overType: OverType = "task", halfPassed = false) =>
	({ type: "end", activeId, overId, overType, halfPassed }) as const;

describe("start / cancel", () => {
	it("start 记录 activeId，清空视觉反馈", () => {
		const result = act({ type: "start", activeId: "t1" }, fixtureBoard());
		expect(result.state).toEqual({
			activeId: "t1",
			dragOverId: null,
			dragPos: null,
		});
		expect(result.commands).toEqual([]);
	});

	it("cancel 复位", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const cancel = dragTransition(start.state, {
			event: { type: "cancel" },
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(cancel.state).toEqual(initialDragState);
	});
});

describe("dragOver：跨列临时落点", () => {
	it("悬停列 → dragPos 落点（列尾 index = 该列未归档任务数）", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const result = dragTransition(start.state, {
			event: over("t1", "c2"),
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(result.state.dragOverId).toBe("c2");
		expect(result.state.dragPos).toEqual({ columnId: "c2", index: 1 });
	});

	it("悬停任务 → dragPos 插到该任务位置", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const result = dragTransition(start.state, {
			event: over("t1", "t3"),
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(result.state.dragPos).toEqual({ columnId: "c2", index: 0 });
	});

	it("悬停任务 → 使用碰撞层计算出的前后投影", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const result = dragTransition(start.state, {
			event: over("t1", "t3", "task", true), // 半程已过 → 落在 t3 之后（index 1）
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(result.state.dragPos).toEqual({ columnId: "c2", index: 1 });
	});

	it("同列排序：不设 dragPos（交给 dnd-kit 内置动画）", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const result = dragTransition(start.state, {
			event: over("t1", "t2"),
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(result.state.dragPos).toBeNull();
		expect(result.state.dragOverId).toBe("c1");
	});

	it("跨列后悬停回源列：落点切回源列", () => {
		const start = act({ type: "start", activeId: "t1" }, fixtureBoard());
		const cross = dragTransition(start.state, {
			event: over("t1", "c2"),
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(cross.state.dragPos).toEqual({ columnId: "c2", index: 1 });
		const back = dragTransition(cross.state, {
			event: over("t1", "c1"),
			ctx: { board: fixtureBoard(), viewMode: "columns" },
		});
		expect(back.state.dragPos?.columnId).toBe("c1");
	});

	it("泳道视图：不做临时重排，清空反馈", () => {
		const start = act(
			{ type: "start", activeId: "t1" },
			fixtureBoard(),
			"swimlane",
		);
		const result = dragTransition(start.state, {
			event: over("t1", "swimlane:l1:c2"),
			ctx: { board: fixtureBoard(), viewMode: "swimlane" },
		});
		expect(result.state.dragOverId).toBeNull();
		expect(result.state.dragPos).toBeNull();
	});
});

describe("dragEnd：提交计划", () => {
	it("无落点 / 同一元素 → 无命令", () => {
		const board = fixtureBoard();
		expect(act(end("t1", ""), board).commands).toEqual([]);
		expect(act(end("t1", "t1"), board).commands).toEqual([]);
	});

	it("列拖拽 → moveColumn", () => {
		const board = fixtureBoard();
		const result = act(end("c1", "c2"), board);
		expect(result.commands).toEqual([
			{ type: "moveColumn", id: "c1", position: 1 },
		]);
	});

	it("任务拖拽（经 dragPos）→ moveTask 到临时落点", () => {
		const board = fixtureBoard();
		const start = act({ type: "start", activeId: "t1" }, board);
		const cross = dragTransition(start.state, {
			event: over("t1", "c2"),
			ctx: { board, viewMode: "columns" },
		});
		const result = dragTransition(cross.state, {
			event: end("t1", "c2"),
			ctx: { board, viewMode: "columns" },
		});
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c2", position: 1 },
		]);
		expect(result.state).toEqual(initialDragState);
	});

	it("任务拖拽（直接落任务上）→ moveTask 到该任务位置", () => {
		const board = fixtureBoard();
		const result = act(end("t1", "t3"), board);
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c2", position: 0 },
		]);
	});

	it("任务拖拽 → dragend 使用最终投影而不是过时的 overId 索引", () => {
		const board = fixtureBoard();
		const result = dragTransition(initialDragState, {
			event: end("t1", "t3", "task", true), // 半程已过 → 最终投影 index 1（而非未过半的 0）
			ctx: { board, viewMode: "columns" },
		});
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c2", position: 1 },
		]);
	});

	it("同列落到下一任务 → moveTask 到该任务位置（真实重排）", () => {
		const board = fixtureBoard(); // t1@0, t2@1
		const result = act(end("t1", "t2"), board);
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c1", position: 1 },
		]);
	});

	it("未知任务 → 无命令", () => {
		const board = fixtureBoard();
		expect(act(end("ghost", "c2"), board).commands).toEqual([]);
	});
});

describe("dragEnd：泳道视图（回归：落点含列维度）", () => {
	it("跨泳道 + 跨列 → moveTask + 摘旧标签 + 贴新标签", () => {
		const board = swimFixture();
		const result = act(end("t1", "swimlane:l2:c2"), board, "swimlane");
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c2", position: 1 },
			{ type: "toggleLabel", taskId: "t1", labelId: "l1", attach: false },
			{ type: "toggleLabel", taskId: "t1", labelId: "l2", attach: true },
		]);
	});

	it("同泳道跨列 → 只 moveTask（不贴摘标签）", () => {
		const board = swimFixture();
		const result = act(end("t1", "swimlane:l1:c2"), board, "swimlane");
		expect(result.commands).toEqual([
			{ type: "moveTask", id: "t1", columnId: "c2", position: 1 },
		]);
	});

	it("跨泳道同列 → 只贴摘标签（不移动）", () => {
		const board = swimFixture();
		const result = act(end("t1", "swimlane:l2:c1"), board, "swimlane");
		expect(result.commands).toEqual([
			{ type: "toggleLabel", taskId: "t1", labelId: "l1", attach: false },
			{ type: "toggleLabel", taskId: "t1", labelId: "l2", attach: true },
		]);
	});

	it("未分组任务贴入泳道 → 只 attach（不摘未分组）", () => {
		const board = swimFixture(); // t2 无标签 = 未分组
		const result = act(end("t2", "swimlane:l1:c1"), board, "swimlane");
		expect(result.commands).toEqual([
			{ type: "toggleLabel", taskId: "t2", labelId: "l1", attach: true },
		]);
	});

	it("落到任务上 → 取其列与泳道", () => {
		const board = swimFixture();
		const result = act(end("t1", "t3"), board, "swimlane");
		expect(result.commands).toContainEqual({
			type: "moveTask",
			id: "t1",
			columnId: "c2",
			position: 1,
		});
		expect(result.commands).toContainEqual({
			type: "toggleLabel",
			taskId: "t1",
			labelId: "l2",
			attach: true,
		});
	});
});
