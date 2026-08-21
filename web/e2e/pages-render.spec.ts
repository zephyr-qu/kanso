// 前端验收：全部计划页面逐一打开，断言关键 UI 渲染且无 console 错误。
// 覆盖：登录 / 工作区 / 看板 / 任务详情 / 仪表盘 / 标签 / 活动 / 设置 / 重定向。
import { expect, test, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

const KEY = process.env.KANSO_ACCESS_KEY ?? "mock-key";

test("全部计划页面逐一渲染（无 console error）", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(String(err)));

	// 登录页。
	await page.goto("/login");
	await expect(page.getByRole("button", { name: "进入" })).toBeVisible();

	// 登录进入系统。
	await page.fill("#access-key", KEY);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
	await page.waitForSelector('a[href*="/p/"]');

	// 取真实 ID 用于参数化路由。
	const wsHref =
		(await page.locator('a[href*="/w/"]').first().getAttribute("href")) ?? "";
	const ws = wsHref.split("/w/")[1]?.split("/")[0] ?? "";
	const pHref =
		(await page.locator('a[href*="/p/"]').first().getAttribute("href")) ?? "";
	const p = pHref.split("/p/")[1]?.split("/")[0] ?? "";

	// 仪表盘。
	await page.goto("/dashboard");
	await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
	await page.waitForTimeout(400); // 等查询渲染

	// 工作区（项目列表）。
	await page.goto(`/w/${ws}`);
	await expect(
		page.getByTestId("page-header").getByRole("button", { name: "新建项目", exact: true }),
	).toBeVisible();
	await page.waitForTimeout(400);

	// 看板。
	await page.goto(`/w/${ws}/p/${p}`);
	await expect(page.getByRole("button", { name: "新建列" })).toBeVisible();
	await page.waitForTimeout(400);

	// 任务详情（进入看板后点第一个任务）。
	await page.goto(`/w/${ws}/p/${p}`);
	await page.waitForSelector("p.break-words");
	await page.locator("p.break-words").first().click();
	await page.waitForURL(/\/t\//);
	await expect(page.getByRole("heading", { name: /评论/ })).toBeVisible();

	// 标签（/w/:ws/labels 路由已移除：标签管理并入看板工具栏弹窗）。
	await page.goto(`/w/${ws}/p/${p}`);
	await expect(page.getByRole("button", { name: "新建列" })).toBeVisible();
	await page.getByRole("button", { name: "标签", exact: true }).click();
	await expect(page.getByRole("dialog").getByText("标签管理")).toBeVisible();

	// 活动。
	await page.goto("/activity");
	await expect(page.getByRole("heading", { name: "活动" })).toBeVisible();

	// 设置。
	await page.goto("/settings");
	await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();

	// 汇总断言：无 console error。
	expect(errors, `页面渲染出现 console 错误:\n${errors.join("\n")}`).toEqual([]);
});
