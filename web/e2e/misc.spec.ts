// 前端验收 F4：其余页面交互——看板标签弹窗、settings 服务配置、dashboard 统计渲染。
import { expect, test, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

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
	await expect(dialog.getByText(/当前项目/)).toBeVisible();
});

test("settings 服务配置：可编辑保存，数据卡含备份导入导出", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	await page.getByRole("link", { name: "设置", exact: true }).click();
	// 页头副标题含「外观 · 服务配置 · 数据 · 关于」，用 exact 命中卡片标题。
	await expect(page.getByText("服务配置", { exact: true })).toBeVisible();
	// 字段说明展示（保存到配置文件）。
	await expect(page.getByText("KANSO_ADDR · :8080")).toBeVisible();
	await expect(page.getByText("KANSO_DATA_DIR · ./data")).toBeVisible();
	await expect(page.getByText("自动归档", { exact: true })).toBeVisible();
	await expect(page.getByText("完成任务保留 7 天后自动归档。", { exact: true })).toBeVisible();
	await expect(page.getByText("跨域部署时填写前端地址，多个用逗号分隔；同源访问留空即可。", { exact: true })).toBeVisible();
	// 可编辑保存（保存到配置文件；自动归档开关只在配置文件中控制）。
	await expect(page.getByRole("button", { name: "保存配置" })).toBeVisible();
	// 数据卡：备份导出/导入入口。
	await expect(page.getByRole("button", { name: "导出备份" })).toBeVisible();
	await expect(page.getByRole("button", { name: "导入备份" })).toBeVisible();
});

test("dashboard 统计卡与面板渲染", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	await page.getByRole("link", { name: "仪表盘", exact: true }).click();
	// 统计卡标签（待办/进行中/紧急）与面板（需要关注/项目速览）可见。
	await expect(page.getByText("待办", { exact: true }).first()).toBeVisible({
		timeout: 5000,
	});
	await expect(page.getByText("需要关注").first()).toBeVisible({
		timeout: 5000,
	});
});
