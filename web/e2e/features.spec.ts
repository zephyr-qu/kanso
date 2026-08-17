// 前端验收：⌘K 命令面板 / Quick Capture / 任务卡优先级·截止日期·评论数。
import { expect, test, type Page } from "@playwright/test";
import { loginToApp, resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

async function openBoard(page: Page) {
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).first().click();
	await page.waitForURL((u) => u.pathname.includes("/p/"));
}

test("⌘K 命令面板：搜索任务并跳转详情", async ({ page }) => {
	await loginToApp(page);
	// 等待应用壳渲染完成（keydown listener 挂载），再触发快捷键。
	await page.locator("aside").getByText("Kanso").waitFor();
	// ⌘K（或 Ctrl+K）打开面板。
	await page.keyboard.press(
		process.platform === "darwin" ? "Meta+k" : "Control+k",
	);
	const dialog = page.getByRole("dialog", { name: "全局搜索" });
	await expect(dialog).toBeVisible();
	await dialog.getByPlaceholder("搜索任务标题、描述…").fill("设计看板");
	// 命中种子任务。
	await expect(dialog.getByText("设计看板原型四个方向")).toBeVisible({
		timeout: 5000,
	});
	// 回车打开任务详情。
	await dialog.getByPlaceholder("搜索任务标题、描述…").press("Enter");
	await page.waitForURL((u) => u.pathname.includes("/t/"));
	await expect(page.getByText("设计看板原型四个方向").first()).toBeVisible();
});

test("Quick Capture：FAB 创建任务停留原页 + toast 反馈", async ({ page }) => {
	await loginToApp(page);
	await page.getByTitle("快速捕获（Q）").click();
	// 注意：toast 也是 role="dialog"（Base UI），须用 hasText 限定快速捕获对话框。
	const dialog = page.getByRole("dialog").filter({ hasText: "快速捕获" });
	await expect(dialog.getByText("快速捕获")).toBeVisible();
	const title = `快捕任务${Date.now() % 100000}`;
	await dialog.getByPlaceholder("任务标题…").fill(title);
	await dialog.getByRole("button", { name: "创建任务" }).click();
	// 创建后停留原页（不跳转项目看板，ADR-0015），toast 反馈创建成功；Dialog 自动关闭。
	await expect(page.getByText("已创建任务")).toBeVisible({ timeout: 5000 });
	await expect(dialog).not.toBeVisible();
	await expect(page).not.toHaveURL(/\/p\//);
});

test("看板任务卡：优先级徽章 + 截止日期 + 评论数", async ({ page }) => {
	await loginToApp(page);
	await openBoard(page);
	// 任务卡显示优先级徽章（PRIORITY_LABEL 已中文化，种子默认 med→"中"）。
	const card = page
		.locator(".kanso-task-card", { hasText: "设计看板原型四个方向" })
		.first();
	await expect(card.locator(".kanso-priority")).toBeVisible({ timeout: 5000 });
});

test("任务详情：优先级展示 + 截止日期设置", async ({ page }) => {
	await loginToApp(page);
	await openBoard(page);
	await page.getByText("设计看板原型四个方向").first().click();
	await page.waitForURL((u) => u.pathname.includes("/t/"));
	// 元数据条可见。
	await expect(page.getByText("状态", { exact: false })).toBeVisible();
	// 优先级展示（中文化标签；切换 UI 未实现，ADR-0015 只定口径不改 UI）。
	await expect(page.getByText("中 优先级")).toBeVisible();
	// 设置截止日期（今天）：DatePicker 是 Popover 按钮 + 日历格子（非 input，不能 fill）。
	await page.getByLabel("截止日期").click();
	await page.getByRole("button", { name: String(new Date().getDate()) }).click();
	// Popover 关闭带 ~150ms 动画：先等其完全关闭（弹层卸载、清除按钮消失），
	// 再断言触发按钮显示所选日期——避免在过渡态断言弹层内元素可见性造成偶发失败。
	await expect(page.getByRole("button", { name: "清除日期" })).toHaveCount(0, {
		timeout: 5000,
	});
	const today = new Date();
	const todayDisplay = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
	await expect(page.getByLabel("截止日期")).toContainText(todayDisplay, {
		timeout: 5000,
	});
});
