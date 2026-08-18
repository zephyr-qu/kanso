// M5 M1:里程碑看板头弹层 CRUD——新建/重命名/设截止/删除。
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

test("里程碑:看板头弹层 新建→重命名→设截止→删除", async ({ page }) => {
	await loginAndOpenBoard(page);

	// 打开里程碑面板(按钮始终可见)。
	await page.getByRole("button", { name: "里程碑" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("里程碑", { exact: true })).toBeVisible();

	// 新建。
	await dialog.getByPlaceholder("新里程碑名称").fill("M1阶段");
	await dialog.getByRole("button", { name: "创建", exact: true }).click();
	await expect(dialog.getByText("M1阶段")).toBeVisible({ timeout: 5000 });

	// M2:页面顶部(主区域,非弹层)出现里程碑进度卡。
	await expect(page.locator("main").getByText("里程碑进度")).toBeVisible();
	await expect(page.locator("main").getByText("M1阶段")).toBeVisible();

	// 重命名(行内 input)。
	await dialog.getByRole("button", { name: "重命名 M1阶段" }).click();
	const renameInput = dialog.getByLabel("重命名里程碑");
	await renameInput.fill("M1-改名");
	await renameInput.press("Enter");
	await expect(dialog.getByText("M1-改名")).toBeVisible({ timeout: 5000 });

	// 设截止:点日历弹出 DatePicker,选今天。
	await dialog.getByRole("button", { name: "设截止 M1-改名" }).click();
	// 先点 DatePicker 触发按钮打开日历,再选今天。
	await page.getByLabel("里程碑截止日期").click();
	await page.getByRole("button", { name: String(new Date().getDate()) }).click();
	// 截止按钮的 title 变为含日期。
	await expect(
		dialog.getByRole("button", { name: "设截止 M1-改名" }),
	).toHaveAttribute("title", /截止/);

	// 删除(ConfirmDialog 确认)。
	await dialog.getByRole("button", { name: "删除里程碑 M1-改名" }).click();
	await page.getByRole("button", { name: "删除", exact: true }).click();
	await expect(dialog.getByText("M1-改名")).toHaveCount(0);
});
