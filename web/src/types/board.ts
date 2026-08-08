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
};

export type BoardColumn = Column & {
	tasks: Task[];
};

export type Board = {
	project: Project;
	columns: BoardColumn[];
	labels: Label[];
};
