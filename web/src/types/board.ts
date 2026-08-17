// 与 Go 后端看板聚合接口对应的前端类型。
import type { Label } from "@/types/label";
import type { Project } from "@/types/project";
import type { Task } from "@/types/task";

export type Column = {
	id: string;
	projectId: string;
	name: string;
	position: number;
	createdAt: string;
	wipLimit?: number | null;
};

export type BoardColumn = Column & {
	tasks: Task[];
};

export type Board = {
	project: Project;
	columns: BoardColumn[];
	labels: Label[];
};

export type Milestone = {
	id: string;
	projectId: string;
	name: string;
	dueDate: string | null;
	createdAt: string;
	/** 进度聚合（后端计算：末列任务数 / 关联任务数）；前端缺省显示「—」。 */
	progress?: { done: number; total: number } | null;
};
