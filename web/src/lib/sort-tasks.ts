// 看板列内任务的显示层排序（仅改变渲染顺序，不改写 position）。
// 字段只保留后端真实存在的：position（原顺序）/ title / createdAt。
// priority/dueDate/number 是前端预留字段，后端任务模型不存在，不做排序入口（spec 0002）。
import type { Task } from "@/types/task";

export type SortField = "position" | "createdAt" | "title";

export type SortDirection = "asc" | "desc";

export type SortConfig = {
	field: SortField;
	direction: SortDirection;
};

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
		}

		return config.direction === "asc" ? comparison : -comparison;
	});

	return sorted;
}
