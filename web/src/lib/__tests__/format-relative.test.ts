// formatUpdated 相对时间文案测试。
import { describe, expect, it } from "vitest";
import { formatUpdated } from "@/lib/format-relative";

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
