// T3 标签库 E2E：看板工具栏入口 + 创建 → 重命名 → 删除 → 看板贴/摘全链路。
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

test("标签库：创建→重命名→删除全流程", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	// 标签库入口位于当前看板工具栏。
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("text=新建列");
	await page.getByRole("button", { name: "标签", exact: true }).click();
	const manager = page.getByRole("dialog");
	await expect(manager.getByText("标签管理")).toBeVisible();

	// 创建：选色板 + 输名称。
	const name = `测试标签${Date.now() % 10000}`;
	await manager.getByPlaceholder("新标签名称").fill(name);
	await manager.getByRole("button", { name: "添加", exact: true }).click();
	await expect(manager.getByText(name, { exact: true })).toBeVisible();

	// 重命名（在对话框作用域内操作，避免与创建区输入框歧义）。
	const renamed = `${name}-改`;
	await manager.getByRole("button", { name: `重命名 ${name}`, exact: true }).click();
	await manager.locator("input").last().fill(renamed);
	await manager.getByRole("button", { name: "保存", exact: true }).click();
	await expect(manager.getByText(renamed, { exact: true })).toBeVisible({ timeout: 5000 });

	// 删除（经确认）。
	await manager.getByRole("button", { name: `删除 ${renamed}`, exact: true }).click();
	const dialog = page.getByRole("dialog").last();
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "删除", exact: true }).last().click();
	await expect(manager.getByText(renamed, { exact: true })).toHaveCount(0);
});

test("看板贴/摘标签：徽章出现与消失", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	// 「标签冒烟」项目待办列有"带标签"任务，且已有"前端"等标签。
	await page.locator('a[href*="/p/"]', { hasText: "标签冒烟" }).click();
	await page.waitForSelector("text=新建列");

	const firstCol = page.locator("div[class*='w-[282px]']").first();
	const firstTask = firstCol.locator("p.break-words").first();
	await expect(firstTask).toBeVisible();
	const taskTitle = (await firstTask.textContent()) ?? "";

	const card = firstTask.locator("xpath=..").locator("xpath=..");
	await card.hover();
	await card
		.getByRole("button", { name: `标签 ${taskTitle}`, exact: true })
		.click();

	// 弹出标签选择面板，点一个标签（如"紧急"）。
	const popup = page.getByRole("dialog").last();
	await expect(popup).toBeVisible();
	await popup.getByText("紧急").click();
	await expect(card.getByText("紧急")).toBeVisible();
});

test("看板贴标签后任务详情页同步显示", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "标签冒烟" }).click();
	await page.waitForSelector("text=新建列");

	// 给第一个任务贴"紧急"。
	const firstCol = page.locator("div[class*='w-[282px]']").first();
	const firstTask = firstCol.locator("p.break-words").first();
	await expect(firstTask).toBeVisible();
	const taskTitle = (await firstTask.textContent()) ?? "";
	const card = firstTask.locator("xpath=..").locator("xpath=..");
	await card.hover();
	await card
		.getByRole("button", { name: `标签 ${taskTitle}`, exact: true })
		.click();
	const popup = page.getByRole("dialog").last();
	await expect(popup).toBeVisible();
	await popup.getByText("紧急").click();
	await expect(card.getByText("紧急")).toBeVisible();

	// 关闭标签面板（Base UI Popover 需 Escape，避免遮挡任务卡点击）。
	await page.keyboard.press("Escape");
	await expect(popup).not.toBeVisible();

	// 打开任务详情：标签应同步出现（回归：mock 曾只更新 task.labels 不同步 detail.labels）。
	await firstTask.click();
	await page.waitForURL(/\/t\//);
	await expect(
		page.locator("main span.kanso-task-detail__label-chip", { hasText: "紧急" }).first(),
	).toBeVisible({ timeout: 5000 });
});
