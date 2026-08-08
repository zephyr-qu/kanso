// 与任务详情聚合接口对应的前端类型。
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export type Comment = {
	id: string;
	taskId: string;
	content: string;
	createdAt: string;
};

export type Activity = {
	id: string;
	resourceType: string;
	resourceId: string;
	action: string;
	data: string | null;
	createdAt: string;
};

export type TaskDetail = {
	task: Task;
	labels: Label[];
	comments: Comment[];
	activity: Activity[];
};
