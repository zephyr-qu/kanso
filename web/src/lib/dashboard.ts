// 仪表盘聚合纯函数：输入看板/活动数据，输出仪表盘统计（mock 与后端共用契约）。
// 状态口径（2026-08 调整）：任务状态由列位置决定——"已完成"= 位于项目末列（position 最大列），
// 不依赖列名，用户重命名列不影响统计。
import type { Board } from "@/types/board";

export type DashboardData = {
	totalTasks: number;
	urgent: number;
	newThisWeek: number;
	doneTasks: number;
	completionPercent: number;
	byColumn: { name: string; count: number }[];
	projects: {
		id: string;
		workspaceId: string;
		name: string;
		done: number;
		total: number;
	}[];
	focus: { id: string; title: string; column: string; urgent: boolean }[];
	recentActivity: { id: string; projectName: string; action: string; createdAt: string }[];
	/** 近 14 天新增/完成趋势（含今天，无数据日期补零）。 */
	trend: { day: string; created: number; completed: number }[];
};

export interface DashboardInput {
	boards: Board[];
	// 拍平的活动流（来自各任务详情）。
	activities: {
		projectName: string;
		action: string;
		createdAt: string;
	}[];
}

const START_OF_WEEK_MS = 7 * 86_400_000; // 粗略"本周"窗口（7 天内创建）
export const DASHBOARD_TREND_DAYS = 14;

/** 计算末列任务数（已完成）：按列 position 最大判定，不依赖列名。 */
function countDone(board: Board): number {
	let maxPos = -1;
	for (const c of board.columns) maxPos = Math.max(maxPos, c.position);
	return board.columns
		.filter((c) => c.position === maxPos)
		.reduce((s, c) => s + c.tasks.length, 0);
}

export function computeDashboard(input: DashboardInput): DashboardData {
	const { boards, activities } = input;
	const now = Date.now();

	const totalTasks = boards.reduce(
		(s, b) => s + b.columns.reduce((x, c) => x + c.tasks.length, 0),
		0,
	);

	const columnTasks = new Map<string, { name: string; count: number }>();
	let doneTasks = 0;
	let urgent = 0;
	let newThisWeek = 0;
	const urgentTasks: { id: string; title: string; column: string }[] = [];

	for (const board of boards) {
		doneTasks += countDone(board);
		for (const column of board.columns) {
			const entry = columnTasks.get(column.name) ?? {
				name: column.name,
				count: 0,
			};
			entry.count += column.tasks.length;
			columnTasks.set(column.name, entry);

			for (const task of column.tasks) {
				if (now - new Date(task.createdAt).getTime() < START_OF_WEEK_MS)
					newThisWeek++;
				const isUrgent = (task.labels ?? []).some((l) => l.name === "紧急");
				if (isUrgent) {
					urgent++;
					urgentTasks.push({
						id: task.id,
						title: task.title,
						column: column.name,
					});
				}
			}
		}
	}

	return {
		totalTasks,
		urgent,
		newThisWeek,
		doneTasks,
		completionPercent:
			totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
		byColumn: [...columnTasks.values()].sort((a, b) => b.count - a.count),
		projects: boards.map((b) => ({
			id: b.project.id,
			workspaceId: b.project.workspaceId,
			name: b.project.name,
			done: countDone(b),
			total: b.columns.reduce((s, c) => s + c.tasks.length, 0),
		})),
		focus: urgentTasks.map((t) => ({ ...t, urgent: true })),
		recentActivity: [...activities]
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
			.slice(0, 8)
			.map((a) => ({
				id: a.createdAt + a.action,
				projectName: a.projectName,
				action: a.action,
				createdAt: a.createdAt,
			})),
		trend: buildTrend(activities),
	};
}

// buildTrend 从活动流聚合近 14 天新增/完成序列（mock 近似：completed 按 task.moved 计，
// 无法区分是否移入末列；后端为精确口径）。日期按 UTC 取（与后端 activity.created_at 一致）。
function buildTrend(
	activities: { action: string; createdAt: string }[],
): DashboardData["trend"] {
	const created = new Map<string, number>();
	const completed = new Map<string, number>();
	for (const a of activities) {
		const day = a.createdAt.slice(0, 10);
		if (a.action === "task.created")
			created.set(day, (created.get(day) ?? 0) + 1);
		if (a.action === "task.moved")
			completed.set(day, (completed.get(day) ?? 0) + 1);
	}
	const points: DashboardData["trend"] = [];
	const today = new Date();
	// 与后端窗口对齐：日期用 UTC 当天。
	const utcDay = (d: Date) =>
		`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
			d.getUTCDate(),
		).padStart(2, "0")}`;
	for (let i = DASHBOARD_TREND_DAYS - 1; i >= 0; i--) {
		const d = new Date(
			Date.UTC(
				today.getUTCFullYear(),
				today.getUTCMonth(),
				today.getUTCDate() - i,
			),
		);
		const day = utcDay(d);
		points.push({
			day,
			created: created.get(day) ?? 0,
			completed: completed.get(day) ?? 0,
		});
	}
	return points;
}
