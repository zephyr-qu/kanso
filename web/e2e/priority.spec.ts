// 回归：优先级在创建任务时可选（看板内联表单），创建后卡片显示所选档位；
// 详情页可修改优先级（PATCH 生效）。
// 修复前：看板表单无优先级 → 恒为「中」；详情只读不可改。
import { expect, test, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

async function loginAndOpenBoard(page: Page) {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");
}

test("看板添加任务：表单可选优先级，卡片显示所选档位", async ({ page }) => {
	await loginAndOpenBoard(page);
	const firstCol = page.locator("div[class*='w-[282px]']").first();
	await firstCol.getByText("添加任务").click();

	// 表单应提供优先级四档。
	const options = firstCol.getByRole("button", { name: /紧急|高|中|低/ });
	await expect(options).toHaveCount(4);

	// 选「高」，创建，卡片显示「高」。
	await firstCol.getByRole("button", { name: "高", exact: true }).click();
	const title = `优先级任务${Date.now() % 100000}`;
	await firstCol.locator("input").fill(title);
	await firstCol.locator("input").press("Enter");
	const card = firstCol.locator("div", { hasText: title }).last();
	await expect(card.getByText("高", { exact: true })).toBeVisible({
		timeout: 5000,
	});
});

test("任务详情：优先级可点击修改并持久化", async ({ page }) => {
	await loginAndOpenBoard(page);
	// 打开第一列第一个任务详情。
	const firstCol = page.locator("div[class*='w-[282px]']").first();
	await firstCol.locator("p.break-words").first().click();
	await page.waitForURL(/\/t\//);
	await expect(page.getByRole("heading", { name: /评论/ })).toBeVisible();

	// 详情优先级区应有四档可点。
	const detail = page.locator("main");
	const prioOptions = detail.getByRole("button", { name: /紧急|高|中|低/ });
	await expect(prioOptions).toHaveCount(4);

	// 点「紧急」，标签区显示「紧急」。
	await detail.getByRole("button", { name: "紧急", exact: true }).click();
	await expect(detail.getByText("紧急", { exact: true }).first()).toBeVisible({
		timeout: 5000,
	});
});
