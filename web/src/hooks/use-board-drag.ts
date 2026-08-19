// 看板拖拽状态机：纯 transition（框架无关）+ useBoardDrag 绑定。
// dnd-kit 事件在绑定层归一化为 {activeId, overId}；board/viewMode 作为 ctx 显式传入。
// dragend 产出「提交计划」（DragCommand[]），页面只做 命令 → mutation 的映射。
// 历史 bug 区域（泳道解析忽略列维度、跨列临时落点、同列让位）整体收敛到此，可单测。
import { useRef, useState } from "react";
import type { Board, BoardColumn } from "@/types/board";
import type { Task } from "@/types/task";

export type DragViewMode = "columns" | "swimlane";

export type DragPlacement = { columnId: string; index: number };

/** 拖拽视觉状态（页面渲染 + 列/任务让位动画消费）。 */
export type DragState = {
	activeId: string | null;
	/** 拖拽悬停的列 id（列容器高亮）。 */
	dragOverId: string | null;
	/** 跨列拖拽的临时落点（视觉移入目标列）；同列排序为 null。 */
	dragPos: { columnId: string; index: number } | null;
};

/** 落点目标是列还是任务（reducer 内部解析 index 所需的语义载荷，保持框架无关）。 */
export type OverType = "column" | "task";

/** 归一化后的拖拽事件（绑定层从 dnd-kit 事件提取，框架无关）。 */
export type DragEvent =
	| { type: "start"; activeId: string }
	| {
		type: "over";
		activeId: string;
		overId: string;
		overType: OverType;
		halfPassed: boolean;
	}
	| {
		type: "end";
		activeId: string;
		overId: string;
		overType: OverType;
		halfPassed: boolean;
	}
	| { type: "cancel" };

/** dragend 提交计划：页面按 type 映射到对应 mutation。 */
export type DragCommand =
	| { type: "moveTask"; id: string; columnId: string; position: number }
	| { type: "moveColumn"; id: string; position: number }
	| { type: "toggleLabel"; taskId: string; labelId: string; attach: boolean };

export type DragAction = { event: DragEvent; ctx: DragContext };

/** 解析落点所需的只读上下文。 */
export type DragContext = {
	board: Board;
	viewMode: DragViewMode;
};

export const initialDragState: DragState = {
	activeId: null,
	dragOverId: null,
	dragPos: null,
};

const activeTasks = (column: BoardColumn): Task[] =>
	column.tasks.filter((task) => !task.archivedAt);

export type SwimlaneGroup = { id: string; name: string; tasks: Task[] };

/** 泳道分组（按标签横向分组，列仍纵向推进）；未分组任务收进「未分组」，无标签时只留未分组。 */
export function swimlaneGroups(board: Board): SwimlaneGroup[] {
	const allTasks = board.columns.flatMap((column) => column.tasks);
	const groups: SwimlaneGroup[] = board.labels
		.map((label) => ({
			id: label.id,
			name: label.name,
			tasks: allTasks.filter((task) =>
				(task.labels ?? []).some((item) => item.id === label.id),
			),
		}))
		.filter((group) => group.tasks.length > 0);
	const ungrouped = allTasks.filter((task) => (task.labels ?? []).length === 0);
	if (ungrouped.length > 0 || groups.length === 0)
		groups.push({ id: "ungrouped", name: "未分组", tasks: ungrouped });
	return groups;
}

function findTask(board: Board, taskId: string): Task | undefined {
	return board.columns
		.flatMap((column) => column.tasks)
		.find((task) => task.id === taskId);
}

/** overId → 所属列（overId 可能是列 id，也可能是任务 id）。 */
function resolveOverColumn(
	board: Board,
	overId: string,
): BoardColumn | undefined {
	if (board.columns.some((column) => column.id === overId)) {
		return board.columns.find((column) => column.id === overId);
	}
	return board.columns.find((column) =>
		column.tasks.some((task) => task.id === overId),
	);
}

/** 落点解析（单一真相源）：over 是列→列尾；over 是任务→半程规则决定插入其前/后，并做同列让位修正。 */
function resolvePlacement(
	board: Board,
	activeId: string,
	overId: string,
	overType: OverType,
	halfPassed: boolean,
	/** shift=true：悬停投影时做同列让位（拖拽卡自身占位随位置游移）；end 无 dragPos 兜底时 false（插到 over 位置）。 */
	shift: boolean,
): DragPlacement | undefined {
	const targetColumnId =
		overType === "column"
			? overId
			: (findTask(board, overId)?.columnId ?? "");
	const targetColumn = board.columns.find((c) => c.id === targetColumnId);
	if (!targetColumn) return undefined;

	const tasks = activeTasks(targetColumn);
	const overIndex =
		overType === "task" ? tasks.findIndex((task) => task.id === overId) : -1;
	if (overIndex < 0) return { columnId: targetColumnId, index: tasks.length };

	// 半程规则：拖拽卡中心到达/越过目标卡中心 → 插入其后。
	let index = overIndex + (halfPassed ? 1 : 0);
	// 同列让位：目标列即源列时，拖拽卡自身占一个空位（仅悬停投影阶段需要）。
	if (shift) {
		const sourceColumn = board.columns.find((c) =>
			c.tasks.some((task) => task.id === activeId),
		);
		const sourceIndex = sourceColumn
			? activeTasks(sourceColumn).findIndex((task) => task.id === activeId)
			: -1;
		const sameColumn = sourceColumn?.id === targetColumnId;
		if (sameColumn && sourceIndex >= 0 && sourceIndex < index) index -= 1;
		return {
			columnId: targetColumnId,
			index: Math.max(0, Math.min(index, tasks.length - (sameColumn ? 1 : 0))),
		};
	}

	return {
		columnId: targetColumnId,
		index: Math.max(0, Math.min(index, tasks.length)),
	};
}

const resetState: DragState = {
	activeId: null,
	dragOverId: null,
	dragPos: null,
};

/** 纯状态转移：返回新拖拽状态 + dragend 的提交计划。 */
export function dragTransition(
	state: DragState,
	action: DragAction,
): { state: DragState; commands: DragCommand[] } {
	const { event, ctx } = action;
	const { board, viewMode } = ctx;

	switch (event.type) {
		case "start":
			return {
				state: { activeId: event.activeId, dragOverId: null, dragPos: null },
				commands: [],
			};

		case "cancel":
			return { state: resetState, commands: [] };

		case "over": {
			const { activeId, overId, overType, halfPassed } = event;
			// 无落点 / 泳道视图不做临时重排：清空列高亮与跨列落点。
			if (!overId || viewMode !== "columns") {
				return {
					state: { ...state, dragOverId: null, dragPos: null },
					commands: [],
				};
			}
			// 列拖拽：列同处一个 SortableContext，内置排序动画足够，不做列高亮与临时重排。
			if (board.columns.some((column) => column.id === activeId))
				return { state, commands: [] };

			const overColumn = resolveOverColumn(board, overId);
			if (!overColumn) {
				return {
					state: { ...state, dragOverId: null, dragPos: null },
					commands: [],
				};
			}
			const dragOverId = overColumn.id;
			const activeTask = findTask(board, activeId);
			if (!activeTask)
				return {
					state: { ...state, dragOverId, dragPos: state.dragPos },
					commands: [],
				};

			const placement = resolvePlacement(board, activeId, overId, overType, halfPassed, true);
			const index = placement?.index ?? activeTasks(overColumn).length;
			const currentColId = state.dragPos?.columnId ?? activeTask.columnId;
			// 悬停回当前所属列：已在列内则跟随更新插入位，否则撤销临时跨列恢复原状。
			if (currentColId === dragOverId) {
				if (state.dragPos) {
					if (state.dragPos.columnId === dragOverId) {
						return state.dragPos.index === index
							? { state: { ...state, dragOverId }, commands: [] }
							: {
									state: { ...state, dragOverId, dragPos: { ...state.dragPos, index } },
									commands: [],
								};
					}
					return { state: { ...state, dragOverId, dragPos: null }, commands: [] };
				}
				return { state: { ...state, dragOverId }, commands: [] };
			}
			// 跨列：计算目标列插入位并临时移入。
			if (
				state.dragPos?.columnId === dragOverId &&
				state.dragPos.index === index
			)
				return { state, commands: [] };
			return {
				state: {
					...state,
					dragOverId,
					dragPos: { columnId: dragOverId, index },
				},
				commands: [],
			};
		}

		case "end": {
			const { activeId, overId, overType, halfPassed } = event;
			if (!overId || activeId === overId)
				return { state: resetState, commands: [] };

			if (viewMode === "swimlane") return endSwimlane(board, activeId, overId);

			// 列拖拽。
			const oldColIndex = board.columns.findIndex(
				(column) => column.id === activeId,
			);
			if (oldColIndex >= 0) {
				const newColIndex = board.columns.findIndex(
					(column) => column.id === overId,
				);
				if (newColIndex < 0) return { state: resetState, commands: [] };
				return {
					state: resetState,
					commands: [
						{ type: "moveColumn", id: activeId, position: newColIndex },
					],
				};
			}

			// 任务拖拽：目标列/位置优先取拖拽期间维护的落点（与视觉一致），否则按 over 解析。
			const dragged = findTask(board, activeId);
			if (!dragged) return { state: resetState, commands: [] };

			let targetColumn: BoardColumn | undefined;
			let targetIndex = 0;
			if (state.dragPos) {
				// 属性收窄不进 find 闭包，先取局部变量。
				const dragPos = state.dragPos;
				targetColumn = board.columns.find((column) => column.id === dragPos.columnId);
				targetIndex = dragPos.index;
			} else {
				const placement = resolvePlacement(board, activeId, overId, overType, halfPassed, false);
				targetColumn = placement
					? board.columns.find((column) => column.id === placement.columnId)
					: resolveOverColumn(board, overId);
				targetIndex = placement?.index ?? (targetColumn ? activeTasks(targetColumn).length : 0);
			}
			if (!targetColumn) return { state: resetState, commands: [] };

			// 同列且位置没变则跳过。
			const sourceColumn = board.columns.find(
				(column) => column.id === dragged.columnId,
			);
			if (
				sourceColumn?.id === targetColumn.id &&
				sourceColumn.tasks.indexOf(dragged) === targetIndex
			) {
				return { state: resetState, commands: [] };
			}
			return {
				state: resetState,
				commands: [
					{
						type: "moveTask",
						id: dragged.id,
						columnId: targetColumn.id,
						position: targetIndex,
					},
				],
			};
		}
		default:
			// 未来新增事件类型若无处理，宁可显式失败也不静默吞掉。
			return { state, commands: [] };
	}
}

/** 泳道视图的 dragend：跨列移动 + 泳道（标签）切换，产出合并后的提交计划。 */
function endSwimlane(
	board: Board,
	activeId: string,
	overId: string,
): { state: DragState; commands: DragCommand[] } {
	const task = findTask(board, activeId);
	if (!task) return { state: resetState, commands: [] };
	const groups = swimlaneGroups(board);

	// 落点解析：格子 id 形如 swimlane:<标签id>:<列id>（保留看板拖拽语义：跨列也生效）；
	// 落到任务上时取其所在列与泳道。
	let targetColumnId = "";
	let targetLane = "";
	if (overId.startsWith("swimlane:")) {
		// parts 已去掉 "swimlane:" 前缀：['<标签id>', '<列id>']（此前多写一个前导逗号导致 lane/column 错位——泳道拖拽从未生效的根因）。
		const [lane, column] = overId.slice("swimlane:".length).split(":");
		targetLane = lane ?? "";
		targetColumnId = column ?? "";
	} else {
		const overTask = findTask(board, overId);
		if (overTask) {
			targetColumnId = overTask.columnId;
			targetLane =
				groups.find((group) =>
					group.tasks.some((item) => item.id === overTask.id),
				)?.id ?? "";
		}
	}
	if (!targetColumnId) return { state: resetState, commands: [] };

	const currentLane = groups.find((group) =>
		group.tasks.some((item) => item.id === task.id),
	)?.id;
	const commands: DragCommand[] = [];

	// 跨列移动：落到目标列末尾（格子无细分插入位，追加最直观）。
	if (targetColumnId !== task.columnId) {
		const targetColumn = board.columns.find(
			(column) => column.id === targetColumnId,
		);
		if (targetColumn) {
			commands.push({
				type: "moveTask",
				id: task.id,
				columnId: targetColumnId,
				position: activeTasks(targetColumn).length,
			});
		}
	}
	// 泳道切换（贴新标签 / 摘旧标签）。
	if (targetLane && targetLane !== currentLane) {
		if (currentLane && currentLane !== "ungrouped") {
			commands.push({
				type: "toggleLabel",
				taskId: task.id,
				labelId: currentLane,
				attach: false,
			});
		}
		if (targetLane !== "ungrouped") {
			commands.push({
				type: "toggleLabel",
				taskId: task.id,
				labelId: targetLane,
				attach: true,
			});
		}
	}
	return { state: resetState, commands };
}

/** 看板页绑定的 hook：吃 dnd-kit 事件（active/over id），产出拖拽状态与派生渲染值。 */
export function useBoardDrag(board: Board | undefined, viewMode: DragViewMode) {
	const [state, setState] = useState<DragState>(initialDragState);
	const stateRef = useRef(state);
	stateRef.current = state;
	const boardRef = useRef(board);
	boardRef.current = board;
	const viewModeRef = useRef(viewMode);
	viewModeRef.current = viewMode;

	const transition = (event: DragEvent): DragCommand[] => {
		const currentBoard = boardRef.current;
		if (!currentBoard) return [];
		const { state: next, commands } = dragTransition(stateRef.current, {
			event,
			ctx: { board: currentBoard, viewMode: viewModeRef.current },
		});
		setState(next);
		return commands;
	};

	const onDragStart = (activeId: string) =>
		void transition({ type: "start", activeId });
	const onDragOver = (activeId: string, overId: string, overType: OverType, halfPassed: boolean) =>
		void transition({ type: "over", activeId, overId, overType, halfPassed });
	const onDragEnd = (activeId: string, overId: string, overType: OverType, halfPassed: boolean): DragCommand[] =>
		transition({ type: "end", activeId, overId, overType, halfPassed });
	const onDragCancel = () => void transition({ type: "cancel" });

	// DragOverlay 数据源 + 列内让位动画所需派生值。
	const activeTask =
		state.activeId && board
			? (board.columns
					.flatMap((column) => column.tasks)
					.find((task) => task.id === state.activeId) ?? null)
			: null;
	const dragActiveTaskId =
		state.activeId &&
		board &&
		!board.columns.some((column) => column.id === state.activeId)
			? state.activeId
			: null;
	const activeTaskColumnId =
		dragActiveTaskId && activeTask ? activeTask.columnId : null;

	return {
		dragState: state,
		activeTask,
		dragActiveTaskId,
		activeTaskColumnId,
		onDragStart,
		onDragOver,
		onDragEnd,
		onDragCancel,
	};
}
