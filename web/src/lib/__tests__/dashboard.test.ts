// computeDashboard 聚合测试。
import { describe, expect, it } from "vitest";
import { computeDashboard } from "@/lib/dashboard";
import type { Board } from "@/types/board";

function makeBoard(): Board {
	return {
		project: {
			id: "p1",
			workspaceId: "w1",
			name: "P",
			position: 0,
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
		},
		labels: [],
		columns: [
			{
				id: "c1",
				projectId: "p1",
				name: "待办",
				position: 0,
				createdAt: "",
				tasks: [
					{
						id: "t1",
						projectId: "p1",
						columnId: "c1",
						title: "急事",
						description: null,
						position: 0,
						createdAt: new Date().toISOString(),
						updatedAt: "",
						labels: [
							{
								id: "l1",
								workspaceId: "w1",
								name: "紧急",
								color: "#ef4444",
								createdAt: "",
							},
						],
					},
					{
						id: "t2",
						projectId: "p1",
						columnId: "c1",
						title: "普通",
						description: null,
						position: 1,
						createdAt: "2026-01-01T00:00:00Z",
						updatedAt: "",
						labels: [],
					},
				],
			},
			{
				id: "c2",
				projectId: "p1",
				name: "进行中",
				position: 1,
				createdAt: "",
				tasks: [
					{
						id: "t3",
						projectId: "p1",
						columnId: "c2",
						title: "开发中",
						description: null,
						position: 0,
						createdAt: new Date().toISOString(),
						updatedAt: "",
						labels: [],
					},
				],
			},
			{
				id: "c3",
				projectId: "p1",
				name: "已完成",
				position: 2,
				createdAt: "",
				tasks: [
					{
						id: "t4",
						projectId: "p1",
						columnId: "c3",
						title: "完成",
						description: null,
						position: 0,
						createdAt: "2026-01-01T00:00:00Z",
						updatedAt: "",
						labels: [],
					},
				],
			},
		],
	};
}

describe("computeDashboard", () => {
	const d = computeDashboard({
		boards: [makeBoard()],
		activities: [
			{
				projectName: "P",
				action: "task.updated",
				createdAt: "2026-08-09T10:00:00Z",
			},
			{
				projectName: "P",
				action: "task.created",
				createdAt: "2026-08-08T10:00:00Z",
			},
		],
	});

	it("任务总数与完成数（末列=已完成，不依赖列名）", () => {
		expect(d.totalTasks).toBe(4);
		expect(d.doneTasks).toBe(1);
	});

	it("完成率", () => {
		expect(d.completionPercent).toBe(25);
	});

	it("紧急标签任务", () => {
		expect(d.urgent).toBe(1);
		expect(d.focus).toHaveLength(1);
		expect(d.focus[0].title).toBe("急事");
	});

	it("本周新增（7 天内创建的 t1/t3）", () => {
		expect(d.newThisWeek).toBe(2);
	});

	it("列分布", () => {
		expect(d.byColumn.find((c) => c.name === "待办")?.count).toBe(2);
	});

	it("项目速览（含 workspaceId，供跨工作区跳转）", () => {
		expect(d.projects).toEqual([
			{ id: "p1", workspaceId: "w1", name: "P", done: 1, total: 4 },
		]);
	});
	it("趋势：14 天窗口且按天补零", () => {
		expect(d.trend).toHaveLength(14);
		const today = d.trend[d.trend.length - 1];
		expect(today.day.length).toBe(10); // YYYY-MM-DD
		for (const p of d.trend) {
			expect(p.created).toBeGreaterThanOrEqual(0);
			expect(p.completed).toBeGreaterThanOrEqual(0);
		}
	});

	it("趋势：今天的 task.created 计入新增", () => {
		const d2 = computeDashboard({
			boards: [makeBoard()],
			activities: [
				{
					projectName: "P",
					action: "task.created",
					createdAt: new Date().toISOString(),
				},
			],
		});
		expect(d2.trend[d2.trend.length - 1].created).toBe(1);
	});

	it("最近活动按时间倒序并带项目名", () => {
		expect(d.recentActivity).toHaveLength(2);
		expect(d.recentActivity[0].text).toContain("在 P 中");
		expect(d.recentActivity[0].text).toContain("更新了任务");
		expect(d.recentActivity[0].time > d.recentActivity[1].time).toBe(true);
	});

	it("空数据不崩溃", () => {
		const empty = computeDashboard({ boards: [], activities: [] });
		expect(empty.totalTasks).toBe(0);
		expect(empty.completionPercent).toBe(0);
		expect(empty.projects).toEqual([]);
	});
});
