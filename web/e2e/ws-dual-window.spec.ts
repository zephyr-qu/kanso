// T6 双窗口 WS 实时同步 E2E：窗口 A 添加/移动/改名任务，窗口 B 无需刷新即同步；
// 项目隔离（A 项目事件不达 B 项目）；断线重连后状态收敛。
// 真后端模式运行（mock 无 WS 源），依赖 e2e/seed.ts 的命名种子。
import { expect, test, type Browser, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});

const KEY = process.env.KANSO_ACCESS_KEY ?? "mock-key";

async function login(page: Page): Promise<void> {
	await page.goto("/login");
	await page.fill("#access-key", KEY);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
	await page.waitForSelector('a[href*="/p/"]');
}

async function openBoard(page: Page, projectName: string): Promise<void> {
	await page.locator('a[href*="/p/"]', { hasText: projectName }).click();
	await page.waitForSelector("text=新建列");
}

// 等待某列中出现/消失指定任务标题（轮询，因为刷新走 WS invalidate 后的 refetch）。
async function expectTaskInColumn(
	page: Page,
	columnIndex: number,
	title: string,
	visible: boolean,
): Promise<void> {
	const col = page.locator("div[class*='w-[282px]']").nth(columnIndex);
	if (visible) {
		await expect(col.getByText(title).first()).toBeVisible({ timeout: 8000 });
	} else {
		await expect(col.getByText(title)).toHaveCount(0, { timeout: 8000 });
	}
}

test("双窗口：A 添加任务 → B 自动出现（无需刷新）", async ({ browser }) => {
	const a = await (browser as Browser).newPage();
	const b = await (browser as Browser).newPage();
	try {
		await login(a);
		await openBoard(a, "看板冒烟");
		await login(b);
		await openBoard(b, "看板冒烟");

		// A 添加任务到第一列（待办）。
		const title = `同步任务${Date.now() % 100000}`;
		const firstCol = a.locator("div[class*='w-[282px]']").first();
		await firstCol.getByText("添加任务").click();
		await firstCol.locator("input").fill(title);
		await firstCol.locator("input").press("Enter");

		// A 自身乐观显示。
		await expectTaskInColumn(a, 0, title, true);
		// B 通过 WS 事件 + refetch 同步出现，全程无手动刷新。
		await expectTaskInColumn(b, 0, title, true);
	} finally {
		await a.close();
		await b.close();
	}
});

test("双窗口：A 移动任务 → B 列分布同步", async ({ browser }) => {
	const a = await (browser as Browser).newPage();
	const b = await (browser as Browser).newPage();
	try {
		await login(a);
		await openBoard(a, "原型演示");
		await login(b);
		await openBoard(b, "原型演示");

		// 用真实 pointer 事件把待办第一个任务拖到进行中（dnd-kit PointerSensor）。
		// 注意：title 必须在拖拽前读取（拖拽后 locator 会解析到新的首位任务）。
		const from = a
			.locator("div[class*='w-[282px]']")
			.first()
			.locator("p.break-words")
			.first();
		const title = (await from.textContent()) ?? "";
		const to = a.locator("div[class*='w-[282px]']").nth(1);
		const sb = (await from.boundingBox())!;
		const tb = (await to.boundingBox())!;
		await a.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
		await a.mouse.down();
		await a.mouse.move(sb.x + sb.width / 2 + 4, sb.y + sb.height / 2 + 10, {
			steps: 3,
		});
		await a.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
			steps: 15,
		});
		await a.mouse.up();

		await expectTaskInColumn(a, 0, title, false);
		await expectTaskInColumn(a, 1, title, true);
		// B 同步跨列分布。
		await expectTaskInColumn(b, 0, title, false);
		await expectTaskInColumn(b, 1, title, true);
	} finally {
		await a.close();
		await b.close();
	}
});

test("双窗口：A 改名任务 → B 标题同步", async ({ browser }) => {
	const a = await (browser as Browser).newPage();
	const b = await (browser as Browser).newPage();
	try {
		await login(a);
		await openBoard(a, "标签冒烟");
		await login(b);
		await openBoard(b, "标签冒烟");

		// A 在详情页重命名待办第一个任务（0008 后卡片无编辑按钮，改名统一在详情页）。
		const newTitle = `改名同步${Date.now() % 100000}`;
		const firstCol = a.locator("div[class*='w-[282px]']").first();
		const task = firstCol.locator("p.break-words").first();
		const oldTitle = (await task.textContent()) ?? "";
		await task.click();
		await a.waitForURL(/\/t\//);
		// 详情页标题点击进入编辑态 → 输入新标题 → Enter 保存。
		await a.locator("main h2").first().click();
		await a.locator("main input").first().fill(newTitle);
		await a.locator("main input").first().press("Enter");
		await expect(a.locator("main h2").first()).toHaveText(newTitle, { timeout: 5000 });

		// 回看板核对两窗口同步。
		await a.goBack();
		await a.waitForSelector("text=新建列");
		await expectTaskInColumn(a, 0, newTitle, true);
		await expectTaskInColumn(a, 0, oldTitle, false);
		await expectTaskInColumn(b, 0, newTitle, true);
		await expectTaskInColumn(b, 0, oldTitle, false);
	} finally {
		await a.close();
		await b.close();
	}
});

test("项目隔离：A 项目事件不送达 B 项目窗口", async ({ browser }) => {
	const a = await (browser as Browser).newPage();
	const b = await (browser as Browser).newPage();
	try {
		await login(a);
		await openBoard(a, "看板冒烟");
		await login(b);
		await openBoard(b, "标签冒烟");

		// 记录 B 侧当前任务标题快照。
		const bCol = b.locator("div[class*='w-[282px]']").first();
		const bTitlesBefore = await bCol.locator("p.break-words").allTextContents();

		// A 在看板冒烟加任务。
		const title = `隔离任务${Date.now() % 100000}`;
		const firstCol = a.locator("div[class*='w-[282px]']").first();
		await firstCol.getByText("添加任务").click();
		await firstCol.locator("input").fill(title);
		await firstCol.locator("input").press("Enter");
		await expectTaskInColumn(a, 0, title, true);

		// B（标签冒烟窗口）不应出现该任务。
		await expectTaskInColumn(b, 0, title, false);
		// 且 B 原有任务保持不变。
		const bTitlesAfter = await bCol.locator("p.break-words").allTextContents();
		expect(bTitlesAfter).toEqual(bTitlesBefore);
	} finally {
		await a.close();
		await b.close();
	}
});

test("断线重连后状态收敛：断开 B 的 WS，A 改任务，B 重连后拉取到最新", async ({
	browser,
}) => {
	const a = await (browser as Browser).newPage();
	const b = await (browser as Browser).newPage();
	try {
		await login(a);
		await openBoard(a, "看板冒烟");
		await login(b);
		await openBoard(b, "看板冒烟");

		// 模拟 B 网络断开（Playwright context.setOffline 会切断页面内 WS）。
		await b.context().setOffline(true);

		// 断线期间 A 加任务。
		const title = `重连任务${Date.now() % 100000}`;
		const firstCol = a.locator("div[class*='w-[282px]']").first();
		await firstCol.getByText("添加任务").click();
		await firstCol.locator("input").fill(title);
		await firstCol.locator("input").press("Enter");
		await expectTaskInColumn(a, 0, title, true);

		// 恢复网络 → WS 自动重连（2s 重试）→ onopen invalidate → refetch 收敛。
		await b.context().setOffline(false);
		await expectTaskInColumn(b, 0, title, true);
	} finally {
		await a.close();
		await b.close();
	}
});
