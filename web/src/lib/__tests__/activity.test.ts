// 活动条目纯函数测试：文案模板（ActivityItem 组件的纯文本面）与按日分组。
import { describe, expect, it } from "vitest";
import { formatActivityText, groupActivitiesByDay } from "@/lib/activity";

describe("formatActivityText", () => {
	it("已知动作渲染「在 X 中，你 Y」", () => {
		expect(formatActivityText("看板冒烟", "task.created")).toBe(
			"在 看板冒烟 中，你 创建了任务",
		);
	});

	it("未识别动作回退原始字符串", () => {
		expect(formatActivityText("P", "custom.event")).toBe(
			"在 P 中，你 custom.event",
		);
	});

	it("15 条动作均有文案（无回退）", () => {
		const actions = [
			"task.created",
			"task.updated",
			"task.moved",
			"task.deleted",
			"column.created",
			"column.updated",
			"column.moved",
			"column.deleted",
			"label.created",
			"label.updated",
			"label.deleted",
			"label.attached",
			"label.detached",
			"comment.created",
			"comment.deleted",
		];
		for (const a of actions) {
			const text = formatActivityText("P", a);
			expect(text).not.toContain(a);
		}
	});
});

describe("groupActivitiesByDay", () => {
	const now = Date.now();
	const DAY = 86_400_000;
	const mk = (offsetMs: number, id: string) => ({
		id,
		projectName: "P",
		action: "task.created",
		createdAt: new Date(now + offsetMs).toISOString(),
	});

	it("今天/昨天/更早分组，组内倒序", () => {
		const groups = groupActivitiesByDay([
			mk(-2 * DAY, "old"), // 更早
			mk(-DAY, "yesterday"), // 昨天
			mk(0, "today-2"), // 今天（晚）
			mk(-1000, "today-1"), // 今天（早）
		]);
		const keys = groups.map((g) => g.key);
		expect(keys).toEqual(["今天", "昨天", "更早"]);
		expect(groups[0].items.map((i) => i.id)).toEqual(["today-2", "today-1"]);
	});

	it("空组不返回", () => {
		const groups = groupActivitiesByDay([mk(-DAY, "only-yesterday")]);
		expect(groups.map((g) => g.key)).toEqual(["昨天"]);
	});
});
