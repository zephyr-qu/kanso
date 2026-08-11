// T1 看板排序切换 E2E：显示层排序（改渲染顺序、不动 position）、字段限标题/创建时间。
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

	const firstCol = page.locator("div[class*='w-[280px]']").first();
	const titles = () => firstCol.locator("p.break-words").allTextContents();

	// 默认原顺序（position 序）——等待列渲染完成。
	await expect
		.poll(() => titles(), { timeout: 5000 })
		.toEqual([
			"设计看板原型四个方向",
			"确定配色与字体体系",
			"梳理拖拽交互细节",
		]);

	// 按标题升序。
	await page.getByRole("button", { name: "标题", exact: true }).click();
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
	await page.getByRole("button", { name: "原顺序", exact: true }).click();
	await expect
		.poll(() => titles(), { timeout: 3000 })
		.toEqual([
			"设计看板原型四个方向",
			"确定配色与字体体系",
			"梳理拖拽交互细节",
		]);
});

test("排序字段仅标题/创建时间（无优先级/截止日期入口）", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");

	await expect(
		page.getByRole("button", { name: "标题", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "创建时间", exact: true }),
	).toBeVisible();
	// 后端无字段的排序入口不应出现。
	await expect(
		page.getByRole("button", { name: /优先级|截止日期|编号/ }),
	).toHaveCount(0);
});
