// 与 Go 后端 task 表对应的前端类型（ADR-0004：前端自行定义 API 类型）。
// 排序字段 priority/dueDate/number 为后续功能预留，MVP 后端不返回时保持 undefined。
import type { Label } from "@/types/label";

export type Task = {
	id: string;
	projectId: string;
	columnId: string;
	title: string;
	description: string | null;
	position: number;
	createdAt: string;
	updatedAt: string;
	priority?: string | null;
	dueDate?: string | null;
	number?: number;
	labels?: Label[];
};
