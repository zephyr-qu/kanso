// 看板列内任务的显示层排序（仅改变渲染顺序，不改写 position）。
// 字段为后端真实存在的：position（原顺序）/ title / createdAt / priority。
// 优先级排序按 urgent > high > med > low，未设置（null/undefined）排最后。
import type { Task } from "@/types/task";
import { normalizePriority, PRIORITIES } from "@/lib/priority";

export type SortField = "position" | "createdAt" | "title" | "priority";

export type SortDirection = "asc" | "desc";

export type SortConfig = {
	field: SortField;
	direction: SortDirection;
};

// priority 排序权重：索引越小越优先；未设置（null/undefined/空串）恒排最后（双向排序均如此）。
function priorityRank(priority: string | null | undefined): number {
	const idx = PRIORITIES.indexOf(normalizePriority(priority));
	if (priority == null || priority === "" || idx === -1) {
		return PRIORITIES.length;
	}
	return idx;
}

// 未设置优先级（null/undefined/空串）判定：null-last 不随方向反转。
function isUnsetPriority(priority: string | null | undefined): boolean {
	return priority == null || priority === "";
}

export function sortTasks(tasks: Task[], config: SortConfig): Task[] {
	if (config.field === "position") {
		return tasks;
	}

	const sorted = [...tasks].sort((a, b) => {
		let comparison = 0;

		switch (config.field) {
			case "createdAt": {
				comparison =
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
				break;
			}
			case "title": {
				comparison = a.title.localeCompare(b.title);
				break;
			}
			case "priority": {
				const aUnset = isUnsetPriority(a.priority);
				const bUnset = isUnsetPriority(b.priority);
				if (aUnset !== bUnset) {
					// 未设置恒排最后：提前 return 绕过下方方向取反。
					return aUnset ? 1 : -1;
				}
				comparison = priorityRank(a.priority) - priorityRank(b.priority);
				break;
			}
		}

		return config.direction === "asc" ? comparison : -comparison;
	});

	return sorted;
}
