// 相对时间格式化唯一接缝（深化候选 2，见架构审查 2026-08）：
// 今天/昨天边界统一按「本地日历日」计算（不滚动 24h 窗口），三页共享。
// formatUpdated 保留（工作区项目卡片「更新于 X 前」语义独立）。

const DAY_MS = 86_400_000;

// 本地日历日边界：今天 00:00 的毫秒时间戳（今天/昨天判定用，非滚动窗口）。
function startOfToday(now = new Date()): number {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// HH:mm（本地时区，2 位补零）。
function hhmm(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 今天/昨天/更早归类（返回 "today" | "yesterday" | "older"）。
function dayBucket(
	iso: string,
	now = new Date(),
): "today" | "yesterday" | "older" {
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "older";
	const boundary = startOfToday(now);
	if (t >= boundary) return "today";
	if (t >= boundary - DAY_MS) return "yesterday";
	return "older";
}

// 日期时间：今天/昨天前缀 + HH:mm；更早含日期「M月D日 HH:mm」。
// 任务详情活动流、仪表盘最近活动用（语义：跨天活动需要日期）。
export function formatDateTime(iso: string, now = new Date()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const time = hhmm(d);
	switch (dayBucket(iso, now)) {
		case "today":
			return `今天 ${time}`;
		case "yesterday":
			return `昨天 ${time}`;
		default:
			return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
	}
}

// 时钟：今天/昨天前缀 + HH:mm；更早仅 HH:mm（贴合原型 #activity 的 a-time）。
// 活动页用。
export function formatClock(iso: string, now = new Date()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const time = hhmm(d);
	switch (dayBucket(iso, now)) {
		case "today":
			return `今天 ${time}`;
		case "yesterday":
			return `昨天 ${time}`;
		default:
			return time;
	}
}

// 相对时间文案（原型项目卡片 meta："更新于今天 / 昨天 / N 天前 / N 周前"）。
export function formatUpdated(iso: string, now = Date.now()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "更新于今天";
	const days = Math.floor((now - d.getTime()) / DAY_MS);
	if (days <= 0) return "更新于今天";
	if (days === 1) return "更新于昨天";
	if (days < 7) return `更新于 ${days} 天前`;
	return `更新于 ${Math.floor(days / 7)} 周前`;
}
