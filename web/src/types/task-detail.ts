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

/** 任务关联的里程碑摘要(M5 多对多归属)。 */
export type MilestoneRef = {
	id: string;
	name: string;
	dueDate: string | null;
};

export type TaskDetail = {
	task: TaskDetailTask;
	/** 所属项目名，供详情页顶部面包屑显示。 */
	projectName: string;
	/** 所属列名，供元数据条"状态"显示。 */
	columnName: string;
	labels: Label[];
	comments: Comment[];
	activity: Activity[];
	/** 该任务已关联的里程碑(多对多挂载)。GET 详情由 taskDetail() 注入,恒为数组。 */
	milestones?: MilestoneRef[];
};
