// 前端验收 F3：项目与工作区 CRUD——创建/重命名/删除全链路。
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

test("项目：创建 → 重命名 → 删除（确认框）", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	// 创建。
	const projName = `验收项目${Date.now() % 100000}`;
	// 页头与项目网格末尾各有一个「新建项目」按钮，点页头那个（DOM 序首个）。
	await page.getByRole("button", { name: "新建项目" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder(/名称|项目/).fill(projName);
	await dialog.getByRole("button", { name: "创建" }).click();
	const card = page.locator('a[href*="/p/"]', { hasText: projName });
	await expect(card).toBeVisible({ timeout: 5000 });

	// 重命名。
	await card
		.getByRole("button", { name: `重命名 ${projName}`, exact: true })
		.click();
	const renameDialog = page.getByRole("dialog");
	const renamed = `${projName}-改`;
	await renameDialog.getByPlaceholder(/名称|项目/).fill(renamed);
	await renameDialog.getByRole("button", { name: "保存" }).click();
	await expect(
		page.locator('a[href*="/p/"]', { hasText: renamed }),
	).toBeVisible({ timeout: 5000 });

	// 删除（经确认框）。
	const card2 = page.locator('a[href*="/p/"]', { hasText: renamed });
	await card2
		.getByRole("button", { name: `删除 ${renamed}`, exact: true })
		.click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "删除", exact: true })
		.click();
	await expect(card2).toHaveCount(0, { timeout: 5000 });
});

test("工作区：侧栏新建 → 跳转 → 重命名 → 删除（确认框）", async ({ page }) => {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');

	// 侧栏新建工作区。
	const wsName = `验收工作区${Date.now() % 100000}`;
	await page.getByRole("button", { name: "新建工作区" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder(/名称|工作区/).fill(wsName);
	await dialog.getByRole("button", { name: "创建" }).click();

	// 创建后跳转到新工作区（项目列表空态），侧栏出现该项。
	await expect(page.getByText("还没有项目")).toBeVisible({ timeout: 5000 });
	const sidebarItem = page.locator("aside").getByText(wsName);
	await expect(sidebarItem).toBeVisible({ timeout: 5000 });

	// 重命名（工作区页标题区铅笔按钮）。
	await page.getByRole("button", { name: "重命名工作区", exact: true }).click();
	const renameDialog = page.getByRole("dialog");
	const renamed = `${wsName}-改`;
	await renameDialog.getByPlaceholder(/名称|工作区/).fill(renamed);
	await renameDialog.getByRole("button", { name: "保存" }).click();
	await expect(page.locator("aside").getByText(renamed)).toBeVisible({
		timeout: 5000,
	});

	// 删除（经确认框，删除后回落到剩余工作区）。
	await page.getByRole("button", { name: "删除工作区", exact: true }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "删除", exact: true })
		.click();
	await expect(page.locator("aside").getByText(renamed)).toHaveCount(0, {
		timeout: 5000,
	});
});
