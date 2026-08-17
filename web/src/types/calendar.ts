// 日历视图（/calendar）聚合的任务条目：基础 Task + 项目归属（页面 queryFn 聚合后消费）。
import type { Task } from "@/types/task";

export type CalendarTask = Task & {
	projectName: string;
	workspaceId: string;
};
