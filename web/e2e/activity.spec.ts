// T4 全局活动页 E2E：侧栏入口、按日分组渲染、活动文案格式。
import { expect, test } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

test("活动页：侧栏入口、分组渲染、文案格式", async ({ page }) => {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");

	// 侧栏「活动」入口可达。
	await page.getByRole("link", { name: "活动", exact: true }).click();
	await expect(page.getByRole("heading", { name: "活动" })).toBeVisible();

	// 种子数据含多条活动流（跨项目），至少渲染一个分组。
	const groups = page.locator("section");
	await expect(groups.first()).toBeVisible({ timeout: 5000 });
	await expect(page.locator("section h2").first()).toHaveText(/今天|昨天|更早/);

	// 条目文案为「在 X 中，你 动作」格式（未识别动作回退原始字符串）。
	const firstItem = page.locator("main li").first();
	await expect(firstItem).toContainText("在");
	await expect(firstItem).toContainText("中，你");
});
