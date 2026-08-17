// 任务优先级：与原型一致的四级（urgent/high/med/low）+ 颜色映射。
// 看板卡、任务详情、Quick Capture、仪表盘共用一份定义（中文显示文案）。

export const PRIORITIES = ["urgent", "high", "med", "low"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
	urgent: "紧急",
	high: "高",
	med: "中",
	low: "低",
};

/** 优先级圆点/文字颜色：urgent=危险红、high=主色橙、med=信息蓝、low=弱灰（原型 pri-*）。 */
export function priorityColor(priority: string | null | undefined): string {
	switch (priority) {
		case "urgent":
			return "var(--semantic-state-danger)";
		case "high":
			return "var(--semantic-action-primary)";
		case "med":
			return "var(--semantic-state-info)";
		case "low":
			return "var(--semantic-content-tertiary)";
		default:
			return "var(--semantic-content-tertiary)";
	}
}

/** 校验任意字符串是否为合法优先级，非法回退 med。 */
export function normalizePriority(p: string | null | undefined): Priority {
	return (PRIORITIES as readonly string[]).includes(p ?? "")
		? (p as Priority)
		: "med";
}
