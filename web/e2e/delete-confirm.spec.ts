// T2 删除确认 E2E：工作区/项目/列/任务四处删除均弹确认框，确认执行、取消不动。
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

test("工作区删除：弹确认框，取消不删", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	await page.getByRole("button", { name: "删除工作区", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText(/其下所有项目/)).toBeVisible();

	// 取消：工作区仍在（标题未消失）。
	await dialog.getByRole("button", { name: "取消" }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole("button", { name: "删除工作区", exact: true })).toBeVisible();
});

test("项目删除：取消不删、确认后删除", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	const projectCard = page.locator('a[href*="/p/"]', { hasText: "看板冒烟" });
	const deleteBtn = projectCard.getByRole("button", { name: "删除 看板冒烟", exact: true });

	// 取消路径。
	await deleteBtn.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "取消" }).click();
	await expect(projectCard).toBeVisible();

	// 确认路径：项目消失。
	await deleteBtn.click();
	await dialog.getByRole("button", { name: "删除", exact: true }).click();
	await expect(projectCard).toHaveCount(0);
});

test("列删除：取消不删、确认后删除（含其下任务）", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "看板冒烟" }).click();
	await page.waitForSelector("text=新建列");

	const firstCol = page.locator("div[class*='w-[280px]']").first();
	const colName = await firstCol
		.locator("span.text-sm.font-semibold")
		.first()
		.textContent();
	// 取消路径。
	await firstCol.getByRole("button", { name: `删除列 ${colName}`, exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "取消" }).click();
	await expect(firstCol).toBeVisible();

	// 确认路径：列消失。
	await firstCol.getByRole("button", { name: `删除列 ${colName}`, exact: true }).click();
	await dialog.getByRole("button", { name: "删除", exact: true }).click();
	await expect(page.locator("div[class*='w-[280px]']").first()).not.toHaveText(
		String(colName),
	);
});

test("任务删除：确认后任务消失", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "看板冒烟" }).click();
	await page.waitForSelector("text=新建列");

	const firstCol = page.locator("div[class*='w-[280px]']").first();
	// 等待任务卡片渲染。
	const firstTask = firstCol.locator("p.break-words").first();
	await expect(firstTask).toBeVisible();
	const taskTitle = (await firstTask.textContent()) ?? "";

	// hover 显示删除按钮并点击。
	const card = firstTask.locator("xpath=..").locator("xpath=..");
	await card.hover();
	await card.getByRole("button", { name: `删除任务 ${taskTitle}`, exact: true }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "删除", exact: true }).click();
	await expect(firstCol.getByText(taskTitle)).toHaveCount(0);
});
