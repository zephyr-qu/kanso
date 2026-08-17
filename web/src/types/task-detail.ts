// 与任务详情聚合接口对应的前端类型。
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export type Comment = {
	id: string;
	taskId: string;
	author: string;
	content: string;
	createdAt: string;
};

export type Activity = {
	id: string;
	resourceType: string;
	resourceId: string;
	action: string;
	actor: string;
	projectName: string;
	data: string | null;
	createdAt: string;
};

/** 任务详情聚合中的任务：基础 Task（工时/Time Entry 已标记 backlog，未实现）。 */
export type TaskDetailTask = Task;

export type TaskDetail = {
	task: TaskDetailTask;
	/** 所属项目名，供详情页顶部面包屑显示。 */
	projectName: string;
	/** 所属列名，供元数据条"状态"显示。 */
	columnName: string;
	labels: Label[];
	comments: Comment[];
	activity: Activity[];
};
