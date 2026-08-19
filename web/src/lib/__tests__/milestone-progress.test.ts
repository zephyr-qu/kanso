import { describe, expect, it } from "vitest";
import { progressPct } from "@/lib/milestone-progress";
import type { Milestone } from "@/types/board";

function milestone(progress: Milestone["progress"]): Milestone {
	return {
		id: "m",
		projectId: "p",
		name: "x",
		dueDate: null,
		createdAt: "",
		progress,
	};
}

describe("progressPct", () => {
	it("无进度 → 0", () => {
		expect(progressPct(milestone(undefined))).toBe(0);
		expect(progressPct(milestone(null))).toBe(0);
		expect(progressPct(null)).toBe(0);
	});
	it("total 为 0 → 0", () => {
		expect(progressPct(milestone({ done: 0, total: 0 }))).toBe(0);
	});
	it("正常比例 → 四舍五入百分比", () => {
		expect(progressPct(milestone({ done: 1, total: 2 }))).toBe(50);
		expect(progressPct(milestone({ done: 1, total: 3 }))).toBe(33);
		expect(progressPct(milestone({ done: 2, total: 3 }))).toBe(67);
	});
	it("完成 → 100", () => {
		expect(progressPct(milestone({ done: 3, total: 3 }))).toBe(100);
	});
});
