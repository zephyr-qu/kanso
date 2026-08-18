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

test("任务详情:勾选归属里程碑,计数与进度随关联更新", async ({ page }) => {
	await loginAndOpenBoard(page);

	// 建一个里程碑。
	await page.getByRole("button", { name: "里程碑" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("新里程碑名称").fill("关联MS");
	await dialog.getByRole("button", { name: "创建", exact: true }).click();
	await expect(dialog.getByText("关联MS")).toBeVisible({ timeout: 5000 });
	await page.keyboard.press("Escape");

	// 打开第一个任务详情。
	const firstCol = page.locator("div[class*='w-[282px]']").first();
	await firstCol.locator("p.break-words").first().click();
	await page.waitForURL(/\/t\//);
	await expect(page.getByRole("heading", { name: /评论/ })).toBeVisible();

	const trigger = page.locator("main").getByRole("button", { name: /里程碑/ });
	await expect(trigger).toContainText("0");

	// 勾选 MS → 计数 1。
	await trigger.click();
	await page.getByRole("button", { name: "关联MS", exact: true }).click();
	await expect(trigger).toContainText("1", { timeout: 5000 });
});

test("分享进度卡:卡片含里程碑进度,可下载PNG", async ({ page }) => {
	await loginAndOpenBoard(page);

	// 建一个里程碑(弹层保持打开)。
	await page.getByRole("button", { name: "里程碑" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("新里程碑名称").fill("进展MS");
	await dialog.getByRole("button", { name: "创建", exact: true }).click();
	await expect(dialog.getByText("进展MS")).toBeVisible({ timeout: 5000 });

	// 在里程碑弹层内点「下载进度卡」打开分享弹窗。
	await dialog.getByRole("button", { name: "下载进度卡" }).click();
	await expect(page.getByText("进度分享卡")).toBeVisible();

	// 卡片含品牌头/项目名/里程碑名称 + 生成时间(无任务明细)。
	await expect(page.getByText(/KANSO/).first()).toBeVisible();
	await expect(page.getByText("进展MS").first()).toBeVisible();
	await expect(page.getByText(/完成/).first()).toBeVisible();

	// 下载 PNPPNG。
	const dl = page.waitForEvent("download", { timeout: 10000 });
	await page.getByRole("button", { name: "下载 PNG" }).click();
	const download = await dl;
	expect(download.suggestedFilename()).toMatch(/png$/);
});

test("点项目页进度卡:打开该里程碑详情面板(非管理)", async ({ page }) => {
	await loginAndOpenBoard(page);

	// 建一个里程碑。
	await page.getByRole("button", { name: "里程碑" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("新里程碑名称").fill("详情MS");
	await dialog.getByRole("button", { name: "创建", exact: true }).click();
	await expect(dialog.getByText("详情MS")).toBeVisible({ timeout: 5000 });
	await page.keyboard.press("Escape");

	// 点页面顶部这个里程碑的进度卡 → 打开详情面板。
	await page.locator("button.kanso-surface-card", { hasText: "详情MS" }).click();
	const detail = page.getByRole("dialog");
	await expect(detail.getByText("详情MS")).toBeVisible();
	await expect(detail.getByText(/关联任务/).first()).toBeVisible();
	await expect(detail.getByText(/进度/).first()).toBeVisible();
});
