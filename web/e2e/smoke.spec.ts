// 基础 E2E 冒烟：登录 → 进入第一个项目看板 → 验证渲染。
import { expect, test } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

test("登录 → 看板冒烟", async ({ page }) => {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	expect(key).toBeTruthy();

	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");

	// 工作区页应显示项目卡片（counts pills）
	await page.waitForSelector('a[href*="/p/"]');
	// 工作区页应有「新建项目」入口（页头按钮 + 项目网格末尾卡片，取首个即可）。
	await expect(page.getByRole("button", { name: "新建项目" }).first()).toBeVisible();

	// 进入第一个项目看板
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");
	await expect(page.locator("text=新建列")).toBeVisible();

	// 看板至少渲染一列（列头含计数 pill）
	const cols = page.locator("div[class*='w-[282px]']");
	await expect(cols.first()).toBeVisible();
});
