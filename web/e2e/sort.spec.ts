// T1 看板排序切换 E2E：显示层排序（改渲染顺序、不动 position）、字段含标题/创建时间/优先级。
import { expect, test } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

async function loginToApp(page: import("@playwright/test").Page) {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
}

test("排序切换：标题升序/降序/恢复原顺序，position 不变", async ({ page }) => {
	await loginToApp(page);

	// 进入「原型演示」项目（待办列含 3 个不同标题的任务）。
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).click();
	await page.waitForSelector("text=新建列");

	const firstCol = page.locator("div[class*='w-[282px]']").first();
	const titles = () => firstCol.locator("p.break-words").allTextContents();

	// 默认原顺序（position 序）——等待列渲染完成。
	await expect
		.poll(() => titles(), { timeout: 5000 })
		.toEqual([
			"设计看板原型四个方向",
			"确定配色与字体体系",
			"梳理拖拽交互细节",
		]);

	// 打开排序下拉，选「标题」升序。
	await page.getByRole("combobox", { name: "任务排序" }).click();
	await page.getByRole("option", { name: "标题", exact: true }).click();
	await expect
		.poll(() => titles(), { timeout: 3000 })
		.toEqual([
			"梳理拖拽交互细节",
			"确定配色与字体体系",
			"设计看板原型四个方向",
		]);

	// 切换方向（降序）。
	await page.getByRole("button", { name: "切换为降序" }).click();
	await expect
		.poll(() => titles(), { timeout: 3000 })
		.toEqual([
			"设计看板原型四个方向",
			"确定配色与字体体系",
			"梳理拖拽交互细节",
		]);

	// 恢复原顺序（position 序不变）。
	await page.getByRole("combobox", { name: "任务排序" }).click();
	await page.getByRole("option", { name: "原顺序", exact: true }).click();
	await expect
		.poll(() => titles(), { timeout: 3000 })
		.toEqual([
			"设计看板原型四个方向",
			"确定配色与字体体系",
			"梳理拖拽交互细节",
		]);
});

test("优先级排序：urgent/high/low 生效（字段入口 + 排序顺序）", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).click();
	await page.waitForSelector("text=新建列");

	// seed 任务无优先级：经 API 给待办列 3 任务打点不同优先级（PATCH 只改 priority）。
	const base =
		process.env.KANSO_API_URL ??
		`http://127.0.0.1:${process.env.KANSO_E2E_API_PORT ?? "8080"}`;
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	const headers = { Authorization: `Bearer ${key}` };
	const projectId = new URL(page.url()).pathname.split("/").pop();
	const board = await (
		await page.request.get(`${base}/api/projects/${projectId}`, { headers })
	).json();
	const todo = board.columns.find((c: { name: string }) => c.name === "待办");
	const byTitle = new Map<string, string>(
		todo.tasks.map((t: { title: string; id: string }) => [t.title, t.id]),
	);
	const priorities: Record<string, string> = {
		"设计看板原型四个方向": "urgent",
		"确定配色与字体体系": "high",
		"梳理拖拽交互细节": "low",
	};
	for (const [title, priority] of Object.entries(priorities)) {
		const r = await page.request.patch(`${base}/api/tasks/${byTitle.get(title)}`, {
			headers,
			data: { priority },
		});
		if (!r.ok()) throw new Error(`设置优先级失败 ${title}: ${r.status()}`);
	}
	await page.reload();
	await page.waitForSelector("text=新建列");

	// 选择「优先级」排序：asc 下 urgent 最前、low 最后。
	await page.getByRole("combobox", { name: "任务排序" }).click();
	await page.getByRole("option", { name: "优先级", exact: true }).click();
	await expect(
		page.locator("div[class*='w-[282px]']").first().locator("p.break-words"),
	).toHaveText([
		"设计看板原型四个方向",
		"确定配色与字体体系",
		"梳理拖拽交互细节",
	]);
});
