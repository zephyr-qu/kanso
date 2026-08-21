import {
	closestCenter,
	pointerWithin,
	rectIntersection,
	type CollisionDetection,
	type DragEndEvent,
	type DragOverEvent,
} from "@dnd-kit/core";
import type { OverType } from "@/hooks/use-board-drag";

/** 看板拖拽的碰撞策略：列拖拽只命中列，任务拖拽优先命中目标列中的任务。 */
export const boardCollisionDetection: CollisionDetection = (args) => {
	const activeType = args.active.data.current?.type;
	const columns = args.droppableContainers.filter(
		(container) => container.data.current?.type === "column",
	);

	if (activeType === "column") {
		return closestCenter({ ...args, droppableContainers: columns });
	}

	const columnHits = pointerWithin({ ...args, droppableContainers: columns });
	const fallbackColumnHits = columnHits.length
		? columnHits
		: rectIntersection({ ...args, droppableContainers: columns });
	const targetColumnId = fallbackColumnHits[0]?.id;
	if (targetColumnId) {
		const tasks = args.droppableContainers.filter(
			(container) =>
				container.data.current?.type === "task" &&
				container.data.current?.columnId === targetColumnId,
		);
		const taskHits = closestCenter({ ...args, droppableContainers: tasks });
		if (taskHits.length > 0) return taskHits;
		return fallbackColumnHits.slice(0, 1);
	}

	return closestCenter({ ...args, droppableContainers: columns });
};

/** 从 dnd-kit 事件提取 reducer 所需的语义载荷，索引数学留在拖拽状态机内。 */
export function overSignal(event: DragOverEvent | DragEndEvent): {
	overId: string;
	overType: OverType;
	halfPassed: boolean;
} {
	const overId = event.over ? String(event.over.id) : "";
	const overType: OverType = event.over?.data.current?.type === "column" ? "column" : "task";
	const ar = event.active.rect.current.translated ?? event.active.rect.current.initial;
	// 半程规则：拖拽卡中心到达/越过目标卡中心，则插入其后。
	const halfPassed = ar && event.over
		? ar.top + ar.height / 2 >= event.over.rect.top + event.over.rect.height / 2
		: false;
	return { overId, overType, halfPassed };
}
