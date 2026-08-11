// 相对时间格式化测试：formatUpdated（UTC 语义）+ formatDateTime/formatClock（本地日历日）。
import { describe, expect, it } from "vitest";
import {
	formatClock,
	formatDateTime,
	formatUpdated,
} from "@/lib/format-relative";

const NOW = Date.parse("2026-08-09T12:00:00Z");

describe("formatUpdated", () => {
	it("今天", () => {
		expect(formatUpdated("2026-08-09T08:00:00Z", NOW)).toBe("更新于今天");
	});
	it("昨天", () => {
		expect(formatUpdated("2026-08-08T08:00:00Z", NOW)).toBe("更新于昨天");
	});
	it("3 天前", () => {
		expect(formatUpdated("2026-08-06T08:00:00Z", NOW)).toBe("更新于 3 天前");
	});
	it("一周前", () => {
		expect(formatUpdated("2026-08-02T08:00:00Z", NOW)).toBe("更新于 1 周前");
	});
	it("两周前", () => {
		expect(formatUpdated("2026-07-26T08:00:00Z", NOW)).toBe("更新于 2 周前");
	});
	it("非法时间回退今天", () => {
		expect(formatUpdated("not-a-date", NOW)).toBe("更新于今天");
	});
});

describe("formatDateTime / formatClock（本地日历日边界）", () => {
	// 固定 now：2026-08-09 12:00 本地时区（new Date 构造本地时间）。
	const now = new Date(2026, 7, 9, 12, 0, 0); // 8 月 9 日 12:00

	it("今天：前缀 + HH:mm", () => {
		expect(formatDateTime("2026-08-09T04:00:00", now)).toBe("今天 04:00");
		expect(formatClock("2026-08-09T04:00:00", now)).toBe("今天 04:00");
	});

	it("昨天：前缀 + HH:mm", () => {
		expect(formatDateTime("2026-08-08T18:00:00", now)).toBe("昨天 18:00");
		expect(formatClock("2026-08-08T18:00:00", now)).toBe("昨天 18:00");
	});

	it("更早：formatDateTime 含日期 / formatClock 仅时间", () => {
		expect(formatDateTime("2026-08-07T09:30:00", now)).toBe("8月7日 09:30");
		expect(formatClock("2026-08-07T09:30:00", now)).toBe("09:30");
	});

	it("回归：昨天下午不被算成今天（滚动窗口 bug）", () => {
		// 昨天 23:00，现在今天 12:00 —— 差 13h < 24h，旧实现会显示「今天」。
		expect(formatDateTime("2026-08-08T23:00:00", now)).toBe("昨天 23:00");
	});

	it("非法时间回退原始字符串", () => {
		expect(formatDateTime("not-a-date", now)).toBe("not-a-date");
		expect(formatClock("not-a-date", now)).toBe("not-a-date");
	});
});
