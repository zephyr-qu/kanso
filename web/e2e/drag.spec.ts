// 前端验收 F1：拖拽交互 E2E——任务同列排序、任务跨列移动、列排序。
// dnd-kit PointerSensor（distance 6px 激活），用真实 pointer 事件序列模拟拖拽。
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

async function openPrototypeBoard(page: Page) {
	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.locator('a[href*="/p/"]', { hasText: "原型演示" }).click();
	await page.waitForSelector("text=新建列");
	await page.waitForSelector("p.break-words");
}

// 用 pointer 事件拖拽 from 到 to（元素中心）。
async function dragTo(
	page: Page,
	from: ReturnType<Page["locator"]>,
	to: ReturnType<Page["locator"]>,
) {
	const sb = (await from.boundingBox())!;
	const tb = (await to.boundingBox())!;
	await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
	await page.mouse.down();
	// 越过 PointerSensor 的 6px 激活距离。
	await page.mouse.move(sb.x + sb.width / 2 + 4, sb.y + sb.height / 2 + 10, {
		steps: 3,
	});
	await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
		steps: 15,
	});
	await page.mouse.up();
}

function columnTasks(page: Page, colIndex: number) {
	return page
		.locator("div[class*='w-[280px]']")
		.nth(colIndex)
		.locator("p.break-words");
}

function taskCard(page: Page, colIndex: number, title: string) {
	return columnTasks(page, colIndex)
		.filter({ hasText: title })
		.first()
		.locator("xpath=..");
}

test("同列拖拽排序：把第一个任务拖到末尾", async ({ page }) => {
	await openPrototypeBoard(page);

	const titles = () => columnTasks(page, 0).allTextContents();
	// 初始顺序：设计看板原型四个方向 / 确定配色与字体体系 / 梳理拖拽交互细节
	await expect.poll(() => titles(), { timeout: 5000 }).toHaveLength(3);

	await dragTo(
		page,
		taskCard(page, 0, "设计看板原型四个方向"),
		taskCard(page, 0, "梳理拖拽交互细节"),
	);

	// 乐观更新立即重排：第一列末尾应为"设计看板原型四个方向"。
	await expect
		.poll(() => titles(), { timeout: 5000 })
		.toEqual([
			"确定配色与字体体系",
			"梳理拖拽交互细节",
			"设计看板原型四个方向",
		]);
});

test("跨列拖拽：把待办第一个任务移到进行中", async ({ page }) => {
	await openPrototypeBoard(page);

	const todoTitles = () => columnTasks(page, 0).allTextContents();
	const doingTitles = () => columnTasks(page, 1).allTextContents();
	await expect.poll(() => todoTitles(), { timeout: 5000 }).toHaveLength(3);
	const doingCountBefore = (await doingTitles()).length;

	await dragTo(
		page,
		taskCard(page, 0, "设计看板原型四个方向"),
		columnTasks(page, 1).first(),
	);

	// 源列减一、目标列加一（乐观更新收敛后）。
	await expect.poll(() => todoTitles(), { timeout: 5000 }).toHaveLength(2);
	await expect
		.poll(() => doingTitles(), { timeout: 5000 })
		.toHaveLength(doingCountBefore + 1);
});

test("列拖拽排序：把第一列拖到末尾", async ({ page }) => {
	await openPrototypeBoard(page);

	const colNames = () =>
		page
			.locator("div[class*='w-[280px]'] span.text-sm.font-semibold")
			.allTextContents();
	await expect.poll(() => colNames(), { timeout: 5000 }).toHaveLength(4);
	expect(await colNames()).toEqual(["待办", "进行中", "已阻塞", "已完成"]);

	const firstCol = page.locator("div[class*='w-[280px]']").nth(0);
	const lastCol = page.locator("div[class*='w-[280px]']").nth(3);
	// 列头是拖拽把手区（含 GripVerticalIcon 的行）。
	const firstColHead = firstCol.locator("div.flex.cursor-grab");
	const lastColHead = lastCol.locator("div.flex.cursor-grab");
	await dragTo(page, firstColHead, lastColHead);

	await expect
		.poll(() => colNames(), { timeout: 5000 })
		.toEqual(["进行中", "已阻塞", "已完成", "待办"]);
});
