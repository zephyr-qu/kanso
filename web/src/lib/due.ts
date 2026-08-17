// 截止日期显示状态：过期 / 临期（今明两天）/ 正常 / 无。
// 与原型 due-badge 语义一致（临期红），并补充过期态。

export type DueState = "overdue" | "soon" | "normal" | "none";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 解析 YYYY-MM-DD（或含时间的 ISO）为本地当天零点。 */
function parseLocal(date: string): Date {
	const [ymd] = date.split("T");
	const [y, m, d] = ymd.split("-").map(Number);
	return new Date(y, m - 1, d);
}

/** 相对今天（本地时区）判断截止日期状态。 */
export function dueState(due: string | null | undefined): DueState {
	if (!due) return "none";
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const target = parseLocal(due);
	if (Number.isNaN(target.getTime())) return "normal";
	const diffDays = Math.round((target.getTime() - today.getTime()) / DAY_MS);
	if (diffDays < 0) return "overdue";
	if (diffDays <= 1) return "soon"; // 今明两天为临期（对齐注释与原型 due-badge 语义）
	return "normal";
}

/** 展示文本：仅日期部分（YYYY-MM-DD → MM-DD）。 */
export function dueDisplay(due: string): string {
	const [ymd] = due.split("T");
	const [, m, d] = ymd.split("-");
	if (m && d) return `${m}-${d}`;
	return ymd;
}
