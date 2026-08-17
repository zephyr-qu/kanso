// 前端验收 F2：任务详情页交互——评论发表/删除、标题/描述编辑、活动流渲染。
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

async function openFirstTaskDetail(page: Page) {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]').first().click();
	await page.waitForSelector("p.break-words");
	await page.locator("p.break-words").first().click();
	await page.waitForURL(/\/t\//);
	await expect(page.getByRole("heading", { name: /评论/ })).toBeVisible();
}

test("评论：发表后出现在列表，可删除", async ({ page }) => {
	await openFirstTaskDetail(page);

	const comment = `验收评论${Date.now() % 100000}`;
	// 评论输入是 textarea（Enter 换行），点「发表评论」提交。
	await page.getByPlaceholder("写下评论…").fill(comment);
	await page.getByRole("button", { name: "发表评论" }).click();

	// 评论出现在列表中。
	await expect(page.locator("main").getByText(comment)).toBeVisible({
		timeout: 5000,
	});

	// 删除评论（评论行 hover 显示删除按钮）。
	const row = page.locator("main .kanso-comment", { hasText: comment }).last();
	await row.hover();
	await row.getByRole("button", { name: "删除评论" }).click();
	// 限定评论列表：活动时间线会显示「删除了评论『内容』」，全 main 匹配会误命中。
	await expect(page.locator("main .kanso-comment-list").getByText(comment)).toHaveCount(0);
});

test("任务标题与描述编辑生效", async ({ page }) => {
	await openFirstTaskDetail(page);

	// 标题编辑：点击标题进入编辑态，改名保存。
	// 详情页对齐原型后：顶部 header 的 h1 是项目名，任务标题是正文首个 h2。
	await page.locator("main h2").first().click();
	const titleInput = page.locator("main input").first();
	const newTitle = `改名标题${Date.now() % 100000}`;
	await titleInput.fill(newTitle);
	await titleInput.press("Enter");
	await expect(page.locator("main h2").first()).toHaveText(newTitle, {
		timeout: 5000,
	});

	// 描述编辑：点击描述区（空描述提示文案），输入后保存。
	await page
		.locator("main")
		.getByText(/暂无描述，点击编辑添加。/)
		.click();
	const descInput = page.locator("main textarea").first();
	const descText = `验收描述${Date.now() % 100000}`;
	await descInput.fill(descText);
	await page.getByRole("button", { name: "保存" }).click();
	await expect(page.locator("main").getByText(descText)).toBeVisible({
		timeout: 5000,
	});
});

test("活动流渲染：含创建活动与动作文案", async ({ page }) => {
	await openFirstTaskDetail(page);
	await expect(page.locator("main").getByText("创建了任务")).toBeVisible({
		timeout: 5000,
	});
});

test("评论刷新后保留（真实后端 SQLite 持久化）", async ({ page }) => {
	await openFirstTaskDetail(page);

	const comment = `持久化评论${Date.now() % 100000}`;
	await page.getByPlaceholder("写下评论…").fill(comment);
	await page.getByRole("button", { name: "发表评论" }).click();
	await expect(page.locator("main").getByText(comment, { exact: true })).toBeVisible({
		timeout: 5000,
	});

	// 刷新页面：真实后端 SQLite 持久化，评论应保留。
	await page.reload();
	await page.waitForSelector('main textarea[placeholder="写下评论…"]');
	await expect(page.locator("main").getByText(comment, { exact: true })).toBeVisible({
		timeout: 5000,
	});
});
