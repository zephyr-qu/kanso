// 全局活动流的共享纯函数：文案格式化与按日分组。
// 仪表盘最近活动面板与活动页（/activity）共用，避免重复实现（ticket 04）。
import { ACTION_LABELS } from "@/lib/events";

// 拍平后的活动流条目（mock /api/activity 与未来后端契约的形状）。
export type FlatActivity = {
	id: string;
	projectName: string;
	action: string;
	createdAt: string;
};

// 活动文案：未识别动作回退显示原始字符串。
export function formatActivityText(
	projectName: string,
	action: string,
): string {
	return `在 ${projectName} 中，你 ${ACTION_LABELS[action] ?? action}`;
}

export type ActivityGroupKey = "今天" | "昨天" | "更早";

// 按日分组（今天/昨天/更早），组内按时间倒序；空组不返回。
export function groupActivitiesByDay(
	activities: FlatActivity[],
): { key: ActivityGroupKey; items: FlatActivity[] }[] {
	const now = new Date();
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const DAY_MS = 86_400_000;

	const groups: Record<ActivityGroupKey, FlatActivity[]> = {
		今天: [],
		昨天: [],
		更早: [],
	};
	for (const a of activities) {
		const t = new Date(a.createdAt).getTime();
		const key: ActivityGroupKey =
			t >= startOfToday ? "今天" : t >= startOfToday - DAY_MS ? "昨天" : "更早";
		groups[key].push(a);
	}

	return (["今天", "昨天", "更早"] as const)
		.filter((key) => groups[key].length > 0)
		.map((key) => ({
			key,
			items: groups[key].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			),
		}));
}
