// T4 全局活动页 E2E：侧栏入口、单卡片操作轨迹、活动文案格式。
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

	// 种子数据含多条活动流（跨项目），统一渲染在原型的操作轨迹卡片中。
	const activityCard = page.locator(".kanso-activity-card");
	await expect(activityCard).toBeVisible({ timeout: 5000 });
	const rowCount = await activityCard.locator(".kanso-recent-activity__row").count();
	expect(rowCount).toBeGreaterThan(0);

	// 条目文案为「在 X 中，{成员名} 动作」格式（成员名动态，不断言具体值；未识别动作回退原始字符串）。
	const firstItem = activityCard.locator(".kanso-recent-activity__row").first();
	await expect(firstItem).toContainText(/^在 .+ 中，.+ /);
	await expect(firstItem).toContainText("在");
});
