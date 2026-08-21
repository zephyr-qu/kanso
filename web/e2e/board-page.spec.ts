// 看板页面级回归：视图切换与归档面板的用户可见行为。
import { expect, test } from "@playwright/test";
import { loginToApp, resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

async function openBoard(page: import("@playwright/test").Page) {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).first().click();
	await page.waitForURL((url) => url.pathname.includes("/p/"));
}

test("看板视图：列视图与泳道视图可以切换", async ({ page }) => {
	await openBoard(page);

	const viewToggle = page.getByRole("group", { name: "看板视图" });
	await expect(viewToggle.getByRole("button", { name: "列" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".kanso-board-row")).toBeVisible();

	await viewToggle.getByRole("button", { name: "泳" }).click();
	await expect(viewToggle.getByRole("button", { name: "泳" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".kanso-swimlanes")).toBeVisible();
	await expect(page.locator(".kanso-board-row")).toHaveCount(0);

	await viewToggle.getByRole("button", { name: "列" }).click();
	await expect(page.locator(".kanso-board-row")).toBeVisible();
});

test("归档面板：打开后展示当前项目的归档状态", async ({ page }) => {
	await openBoard(page);

	await page.getByRole("button", { name: "归档" }).click();
	const dialog = page.getByRole("dialog", { name: "归档任务" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("暂无归档任务")).toBeVisible();
});
