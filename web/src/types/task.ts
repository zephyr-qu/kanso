// 与 Go 后端 task 表对应的前端基础类型（ADR-0004：前端自行定义 API 类型）。
// 这里是「基础契约」：后端 task 表真实字段 + 各消费方共享的 M4 扩展字段。
// 端点特有字段不进基础 Task——见 task-detail.ts（TaskDetailTask）/ search.ts（SearchHit）/ calendar.ts（CalendarTask）。
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
	/** 共享 M4 扩展字段（看板/详情/日历/搜索多处消费；optional 表示「可能为空」，而非「可能缺失于某端点」。 */
	priority?: string | null;
	dueDate?: string | null;
	archivedAt?: string | null;
	/** 完成打点（仅 Mock 维护：进入末列时设置；真实后端不返回此字段，
	 *  完成趋势由 /api/dashboard 的 trend 按 activity 推导，口径含「移入末列」与「末列直建」）。 */
	completedAt?: string | null;
	labels?: Label[];
};
