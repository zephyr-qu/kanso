// 看板交互增强：键盘拖拽、排序模式边界、乐观回滚、里程碑长按连线。
import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

async function loginToApp(page: Page): Promise<void> {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((url) => url.pathname !== "/login");
}

async function openPrototypeBoard(page: Page): Promise<void> {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).click();
	await page.waitForSelector("text=新建列");
	await expect(page.locator(".kanso-task-card").first()).toBeVisible();
}

function column(page: Page, index: number): Locator {
	return page.locator("div[class*='w-[282px]']").nth(index);
}

function taskCard(page: Page, columnIndex: number, title: string): Locator {
	return column(page, columnIndex)
		.locator(".kanso-task-card")
		.filter({ hasText: title })
		.first();
}

async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
	const source = (await from.boundingBox())!;
	const target = (await to.boundingBox())!;
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + source.width / 2 + 4, source.y + source.height / 2 + 10, { steps: 3 });
	await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
	await page.mouse.up();
}

test("键盘拖拽：Space 抓取、Escape 取消不改变顺序", async ({ page }) => {
	await openPrototypeBoard(page);

	const source = taskCard(page, 0, "设计看板原型四个方向");
	let taskPatchCount = 0;
	page.on("request", (request) => {
		if (request.method() === "PATCH" && /\/api\/tasks\//.test(request.url())) taskPatchCount += 1;
	});
	await source.focus();
	await expect(source).toBeFocused();
	await page.keyboard.press("Space");
	await expect(source).toHaveAttribute("data-dragging", "true");
	await page.keyboard.press("Escape");
	await expect(source).not.toHaveAttribute("data-dragging", "true");
	await expect(column(page, 0).locator(".kanso-task-card__title")).toHaveText([
		"设计看板原型四个方向",
		"确定配色与字体体系",
		"梳理拖拽交互细节",
	]);
	expect(taskPatchCount).toBe(0);
});

test("排序模式：显示层排序时拖拽不会提交任务移动", async ({ page }) => {
	await openPrototypeBoard(page);

	await page.getByRole("combobox", { name: "任务排序" }).click();
	await page.getByRole("option", { name: "标题", exact: true }).click();

	let taskPatchCount = 0;
	page.on("request", (request) => {
		if (request.method() === "PATCH" && /\/api\/tasks\//.test(request.url())) taskPatchCount += 1;
	});

	const first = taskCard(page, 0, "梳理拖拽交互细节");
	const last = taskCard(page, 0, "设计看板原型四个方向");
	await drag(page, first, last);
	await page.waitForTimeout(300);

	expect(taskPatchCount).toBe(0);
	await expect(column(page, 0).locator(".kanso-task-card__title")).toHaveText([
		"梳理拖拽交互细节",
		"确定配色与字体体系",
		"设计看板原型四个方向",
	]);
});

test("任务移动失败：乐观跨列移动回滚到原列", async ({ page }) => {
	await openPrototypeBoard(page);
	await page.route("**/api/tasks/*", async (route) => {
		if (route.request().method() === "PATCH") {
			await route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ error: "模拟移动失败" }),
			});
			return;
		}
		await route.continue();
	});

	const source = taskCard(page, 0, "设计看板原型四个方向");
	await drag(page, source, column(page, 1).locator(".kanso-task-card").first());

	// 先观察乐观状态确实进入目标列，再等失败回调恢复快照。
	await expect(taskCard(page, 1, "设计看板原型四个方向")).toBeVisible({ timeout: 1000 });
	await expect(taskCard(page, 0, "设计看板原型四个方向")).toBeVisible({ timeout: 5000 });
	await expect(taskCard(page, 1, "设计看板原型四个方向")).toHaveCount(0);
});

test("里程碑长按连线：拖到任务卡后建立关联", async ({ page }) => {
	await openPrototypeBoard(page);

	await page.getByRole("button", { name: "里程碑" }).click();
	const dialog = page.getByRole("dialog", { name: "里程碑", exact: true });
	await dialog.getByPlaceholder("新里程碑名称").fill("长按关联测试");
	await dialog.getByRole("button", { name: "创建", exact: true }).click();
	await expect(dialog.getByText("长按关联测试")).toBeVisible({ timeout: 5000 });
	await dialog.getByRole("button", { name: "关闭" }).click();
	await expect(dialog).toBeHidden();

	const milestoneCard = page.locator('[role="button"].kanso-surface-card', { hasText: "长按关联测试" }).first();
	const targetTask = taskCard(page, 0, "设计看板原型四个方向");
	await expect(milestoneCard).toBeVisible();
	await expect(targetTask).toBeVisible();
	const source = (await milestoneCard.boundingBox())!;
	const target = (await targetTask.boundingBox())!;
	const linkRequest = page.waitForRequest((request) =>
		request.method() === "POST" && /\/api\/tasks\/[^/]+\/milestones\//.test(request.url()),
	);
	await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(350);
	await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
	await page.mouse.up();
	await linkRequest;

	// 手势结束后读取详情接口，验证 UI 手势实际落成了领域关联。
	const projectId = new URL(page.url()).pathname.split("/").pop();
	const apiBase = process.env.KANSO_API_URL ?? `http://127.0.0.1:${process.env.KANSO_E2E_API_PORT ?? "8080"}`;
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	const headers = { Authorization: `Bearer ${key}` };
	const milestones = await page.request.get(`${apiBase}/api/projects/${projectId}/milestones`, { headers });
	const milestone = ((await milestones.json()) as { id: string; name: string }[]).find((item) => item.name === "长按关联测试");
	expect(milestone).toBeTruthy();
	const linked = await page.request.get(`${apiBase}/api/milestones/${milestone!.id}/tasks`, { headers });
	await expect(linked).toBeOK();
	const linkedTasks = (await linked.json()) as { title: string }[];
	expect(linkedTasks.some((item) => item.title === "设计看板原型四个方向")).toBe(true);
});
