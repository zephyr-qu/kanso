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

// YYYY-MM-DD（或含时间 ISO）相对「now」的本地日历日差：0=今天、1=昨天；非法时间 NaN。
function calendarDaysAgo(iso: string, now: Date): number {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return NaN;
	const todayStart = startOfToday(now);
	const dayStart = new Date(
		d.getFullYear(),
		d.getMonth(),
		d.getDate(),
	).getTime();
	return Math.round((todayStart - dayStart) / DAY_MS);
}

// 共享：今天/昨天/更早 + HH:mm；olderWithDate 控制「更早」是否带日期（formatDateTime 带 / formatClock 不带）。
function formatDayClock(
	iso: string,
	now: Date,
	olderWithDate: boolean,
): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const time = hhmm(d);
	switch (dayBucket(iso, now)) {
		case "today":
			return `今天 ${time}`;
		case "yesterday":
			return `昨天 ${time}`;
		default:
			return olderWithDate
				? `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
				: time;
	}
}

// 日期时间：今天/昨天前缀 + HH:mm；更早含日期「M月D日 HH:mm」（任务详情活动流、仪表盘最近活动）。
export function formatDateTime(iso: string, now = new Date()): string {
	return formatDayClock(iso, now, true);
}

// 时钟：今天/昨天前缀 + HH:mm；更早仅 HH:mm（活动页用）。
export function formatClock(iso: string, now = new Date()): string {
	return formatDayClock(iso, now, false);
}

// 共享：今天/昨天/N 天前（≤6 天）的带前缀文本；更早返回 null 由调用方补尾（周数 或 具体日期）。
function dayLabel(iso: string, now: Date, prefix: string): string | null {
	const days = calendarDaysAgo(iso, now);
	if (Number.isNaN(days) || days <= 0) return `${prefix}今天`;
	if (days === 1) return `${prefix}昨天`;
	if (days < 7) return `${prefix} ${days} 天前`;
	return null;
}

// 相对时间文案（原型项目卡片 meta："更新于今天 / 昨天 / N 天前 / N 周前"）。
export function formatUpdated(iso: string, now = Date.now()): string {
	const date = new Date(now);
	const label = dayLabel(iso, date, "更新于");
	if (label) return label;
	return `更新于 ${Math.floor(calendarDaysAgo(iso, date) / 7)} 周前`;
}

// 任务卡底部的紧凑时间：优先级不抢空间，使用短相对日期（本地日历日口径）。
export function formatTaskCardTime(iso: string, now = Date.now()): string {
	const date = new Date(now);
	const label = dayLabel(iso, date, "");
	if (label) return label;
	const d = new Date(iso);
	return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// 活动流相对时间：近期用滚动窗口（分钟/小时前），更早回到日历日口径（昨天 / M月D日）。
export function formatActivityAge(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const diff = Math.max(0, Date.now() - date.getTime());
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
	const days = calendarDaysAgo(iso, new Date());
	if (days === 1) return `昨天 ${hhmm(date)}`;
	return `${date.getMonth() + 1}月${date.getDate()}日 ${hhmm(date)}`;
}
