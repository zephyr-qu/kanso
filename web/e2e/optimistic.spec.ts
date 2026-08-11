// T5 乐观更新回归测试：添加任务即时出现（不依赖 refetch 返回）。
// 挂起看板 refetch（模拟慢网络），断言任务在响应返回前出现在列中；正常路径数据最终一致。
import { expect, test } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

test("添加任务乐观插入：refetch 挂起时任务仍即时出现", async ({ page }) => {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");

	// 挂起看板 GET：首次加载放行，之后（添加任务触发的 refetch）挂起不返回。
	let releaseGet: () => void;
	const gate = new Promise<void>((r) => (releaseGet = r));
	let getCount = 0;
	await page.route("**/api/projects/*", async (route) => {
		getCount++;
		if (getCount > 1) await gate; // 模拟慢网络：refetch 永不返回
		await route.continue();
	});

	const firstCol = page.locator("div[class*='w-[280px]']").first();
	const title = `乐观任务${Date.now() % 100000}`;
	const t0 = Date.now();
	await firstCol.getByText("添加任务").click();
	await firstCol.locator("input").fill(title);
	await firstCol.locator("input").press("Enter");

	// 任务应在 500ms 内出现（此时 refetch 仍挂起，说明走的是乐观插入）。
	await expect(firstCol.getByText(title)).toBeVisible({ timeout: 500 });
	console.log(`任务出现耗时: ${Date.now() - t0}ms（refetch 挂起中）`);

	// 释放挂起后数据最终一致（任务仍在）。
	releaseGet!();
	await expect(firstCol.getByText(title)).toBeVisible({ timeout: 5000 });
});

test("添加任务正常路径：数据最终一致", async ({ page }) => {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");

	const firstCol = page.locator("div[class*='w-[280px]']").first();
	const title = `正常任务${Date.now() % 100000}`;
	await firstCol.getByText("添加任务").click();
	await firstCol.locator("input").fill(title);
	await firstCol.locator("input").press("Enter");
	await expect(firstCol.getByText(title)).toBeVisible({ timeout: 5000 });
});
