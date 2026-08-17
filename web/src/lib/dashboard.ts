// 仪表盘聚合响应类型（/api/dashboard）。
// 状态口径（2026-08 调整）：任务状态由列位置决定——"已完成"= 位于项目末列（position 最大列），
// 不依赖列名，用户重命名列不影响统计。
// 聚合由后端 internal/service/dashboard.go 实现；前端不再持有平行实现
// （mock 层已删，见架构审查候选 4）。

export type DashboardData = {
	totalTasks: number;
	urgent: number;
	newThisWeek: number;
	doneTasks: number;
	completionPercent: number;
	byColumn: { name: string; count: number }[];
	byPriority: { priority: string; count: number }[];
	projects: {
		id: string;
		workspaceId: string;
		name: string;
		done: number;
		total: number;
	}[];
	focus: {
		id: string;
		title: string;
		column: string;
		projectName: string;
		dueDate: string | null;
		urgent: boolean;
	}[];
	recentActivity: {
		id: string;
		projectName: string;
		action: string;
		/** 活动载荷（JSON 字符串），供活动详情文案展示（与 /api/activity 同构）。 */
		data?: string | null;
		/** 执行者名（ADR-0013：team 模式为成员名，personal 为 Admin）。 */
		actor?: string;
		createdAt: string;
	}[];
	/** 近 14 天新增/完成趋势（含今天，无数据日期补零）；仪表盘展示最后 7 天。 */
	trend: { day: string; created: number; completed: number }[];
};
