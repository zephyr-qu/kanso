// 前端验收 F4：其余页面交互——看板标签弹窗、settings 备份下载、dashboard 统计渲染。
import { expect, test, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

async function loginToApp(page: Page) {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
}

test("看板标签弹窗：打开可见创建区与标签库", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");

	await page.getByRole("button", { name: "标签", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("标签管理")).toBeVisible();
	await expect(dialog.getByText(/工作区/)).toBeVisible();
});

test("settings 备份下载：点击下载触发 JSON 文件下载", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	await page.getByRole("link", { name: "设置", exact: true }).click();
	await page.waitForSelector("text=访问");

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: /下载|备份/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(
		/^kanso-backup-\d{4}-\d{2}-\d{2}\.json$/,
	);
});

test("dashboard 统计卡与面板渲染", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	await page.getByRole("link", { name: "仪表盘", exact: true }).click();
	// 统计卡标签（待办/进行中/紧急）与面板（需要关注/项目速览）可见。
	await expect(page.getByText("待办", { exact: true }).first()).toBeVisible({
		timeout: 5000,
	});
	await expect(page.getByText("需要关注").first()).toBeVisible({ timeout: 5000 });
});
