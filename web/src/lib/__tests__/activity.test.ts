// 活动条目纯函数测试：文案模板（ActivityItem 组件的纯文本面）与按日分组。
import { describe, expect, it } from "vitest";
import {
	activityDetail,
	activitySentenceParts,
	formatActivityText,
	groupActivitiesByDay,
} from "@/lib/activity";

describe("formatActivityText", () => {
	it("已知动作渲染「在 X 中，你 Y」", () => {
		expect(formatActivityText("看板冒烟", "task.created")).toBe(
			"在 看板冒烟 中，你 创建了任务",
		);
	});

	it("带 data 时渲染动作细节", () => {
		expect(
			formatActivityText(
				"看板冒烟",
				"task.created",
				JSON.stringify({ title: "全局搜索" }),
			),
		).toBe("在 看板冒烟 中，你 创建了任务「全局搜索」");
	});

	it("未识别动作回退原始字符串", () => {
		expect(formatActivityText("P", "custom.event")).toBe(
			"在 P 中，你 custom.event",
		);
	});

	it("全部动作均有文案（无回退）", () => {
		const actions = [
			"task.created",
			"task.updated",
			"task.moved",
			"task.deleted",
			"task.archived",
			"task.restored",
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
			"milestone.created",
			"milestone.updated",
			"milestone.deleted",
			"milestone.attached",
			"milestone.detached",
			"member.created",
			"member.updated",
			"member.deleted",
		];
		for (const a of actions) {
			const text = formatActivityText("P", a);
			expect(text).not.toContain(a);
		}
	});
});

describe("activitySentenceParts（句子模板单一来源）", () => {
	it("JSX 派生（project/actor 片段）与纯文本 formatActivityText 一致", () => {
		const parts = activitySentenceParts(
			"看板冒烟",
			"task.created",
			JSON.stringify({ title: "全局搜索" }),
		);
		expect(parts.project).toBe("看板冒烟");
		expect(parts.actor).toBe("你");
		// 模拟 ActivityItem 的 JSX 拼接（含 actor 后空格）。
		expect(
			`${parts.pre}${parts.project}${parts.mid}${parts.actor} ${parts.verb}${parts.detail}`,
		).toBe("在 看板冒烟 中，你 创建了任务「全局搜索」");
		expect(
			formatActivityText(
				"看板冒烟",
				"task.created",
				JSON.stringify({ title: "全局搜索" }),
			),
		).toBe("在 看板冒烟 中，你 创建了任务「全局搜索」");
	});

	it("未识别动作回退原始字符串", () => {
		const parts = activitySentenceParts("P", "custom.event");
		expect(parts.verb).toBe("custom.event");
		expect(parts.detail).toBe("");
	});
});

describe("activityDetail", () => {
	it("task.created / task.updated 带标题", () => {
		expect(
			activityDetail("task.created", JSON.stringify({ title: "全局搜索" })),
		).toBe("「全局搜索」");
		expect(
			activityDetail("task.updated", JSON.stringify({ title: "日历视图" })),
		).toBe("「日历视图」");
	});

	it("task.moved 带列名（待办 → 进行中）", () => {
		expect(
			activityDetail(
				"task.moved",
				JSON.stringify({
					from: "a",
					to: "b",
					fromName: "待办",
					toName: "进行中",
				}),
			),
		).toBe("（待办 → 进行中）");
	});

	it("task.moved 仅列 ID（真实后端）时不泄露 ID", () => {
		expect(
			activityDetail("task.moved", JSON.stringify({ from: "col-1", to: "col-2" })),
		).toBe("");
	});

	it("task.moved 同列重排无详情", () => {
		expect(
			activityDetail(
				"task.moved",
				JSON.stringify({
					from: "a",
					to: "a",
					fromName: "进行中",
					toName: "进行中",
				}),
			),
		).toBe("");
	});

	it("标签 / 里程碑", () => {
		expect(
			activityDetail("label.attached", JSON.stringify({ label: "前端" })),
		).toBe("「前端」");
		expect(
			activityDetail(
				"milestone.detached",
				JSON.stringify({ milestoneId: "m1", milestoneName: "M3 保存视图" }),
			),
		).toBe("「M3 保存视图」");
	});

	it("评论正文超长截断", () => {
		expect(
			activityDetail(
				"comment.created",
				JSON.stringify({ content: "a".repeat(50) }),
			),
		).toBe("「" + "a".repeat(40) + "…」");
	});

	it("data 为空 / 非法 / 未匹配动作时无详情", () => {
		expect(activityDetail("task.created", null)).toBe("");
		expect(activityDetail("task.created", "not-json")).toBe("");
		expect(activityDetail("task.deleted", JSON.stringify({ title: "x" }))).toBe(
			"",
		);
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
