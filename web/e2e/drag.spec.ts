// 前端验收 F1：拖拽交互 E2E——任务同列排序、任务跨列移动、列排序。
// dnd-kit PointerSensor（distance 8px 激活），用真实 pointer 事件序列模拟拖拽。
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
	// 任务卡整卡即拖拽面（无独立手柄），直接从卡片中心拖；列仍经列头手柄。
	const columnGrip = from.locator("button[aria-label^='拖拽列']");
	if (await columnGrip.count()) from = columnGrip.first();
	const sb = (await from.boundingBox())!;
	const tb = (await to.boundingBox())!;
	await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
	await page.mouse.down();
	// 越过 PointerSensor 的 8px 激活距离。
	await page.mouse.move(sb.x + sb.width / 2 + 4, sb.y + sb.height / 2 + 10, {
		steps: 3,
	});
	await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
		steps: 15,
	});
	await page.mouse.up();
}

// 任务卡无独立手柄：拖拽源即卡片本身（整卡挂 listeners）。
function dragSource(card: ReturnType<Page["locator"]>) {
	return card;
}

function columnTasks(page: Page, colIndex: number) {
	return page
		.locator("div[class*='w-[282px]']")
		.nth(colIndex)
		.locator("p.break-words");
}

function taskCard(page: Page, colIndex: number, title: string) {
	return columnTasks(page, colIndex)
		.filter({ hasText: title })
		.first()
		.locator("xpath=..");
}

test("任务卡片顶部保持原有左对齐布局", async ({ page }) => {
	await openPrototypeBoard(page);

	const card = taskCard(page, 0, "设计看板原型四个方向");
	await expect(card.locator(".kanso-task-card__top")).toHaveCSS("justify-content", "flex-start");
});

test("列容器按内容高度展开，不占满整个看板", async ({ page }) => {
	await openPrototypeBoard(page);

	const columns = page.locator("div[class*='w-[282px]'] .kanso-board-column");
	const heights = await columns.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
	// 第一列有任务、第三列为空：有任务的列应明显高于空列，
	// 但不应被行容器强制拉成相同高度。
	expect(heights[0]).toBeGreaterThan(heights[2] + 100);
});

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

test("同列上下移动时原始卡片不与拖拽副本叠加", async ({ page }) => {
	await openPrototypeBoard(page);

	const source = taskCard(page, 0, "设计看板原型四个方向");
	const target = taskCard(page, 0, "梳理拖拽交互细节");
	const sb = (await source.boundingBox())!;
	const tb = (await target.boundingBox())!;
	await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
	await page.mouse.down();
	await page.mouse.move(sb.x + sb.width / 2 + 4, sb.y + sb.height / 2 + 10, { steps: 3 });
	await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.25, { steps: 8 });
	await expect(source).toHaveCSS("opacity", "0");
	await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.75, { steps: 8 });
	await expect(source).toHaveCSS("opacity", "0");
	await page.mouse.up();
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

test("跨列拖拽悬停时目标列按真实卡片高度让位", async ({ page }) => {
	await openPrototypeBoard(page);

	const source = taskCard(page, 0, "设计看板原型四个方向");
	const target = taskCard(page, 1, "实现登录页品牌时刻");
	const before = await page.locator("div[class*='w-[282px]']").nth(1).boundingBox();
	const sourceBox = (await source.boundingBox())!;
	const targetBox = (await target.boundingBox())!;

	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 4, sourceBox.y + sourceBox.height / 2 + 10, { steps: 3 });
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.35, { steps: 12 });

	const during = await page.locator("div[class*='w-[282px]']").nth(1).boundingBox();
	const targetCards = await page.locator("div[class*='w-[282px]']").nth(1).locator(".kanso-task-card").evaluateAll((cards) =>
		cards.map((card) => {
			const rect = card.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom, opacity: getComputedStyle(card).opacity };
		}),
	);

	// 悬停跨列时目标列必须真的为拖拽卡片留出一张卡片的空间，
	// 不能只改 SortableContext.items 而让 DOM 高度保持不变。
	expect(during!.height).toBeGreaterThanOrEqual(before!.height + sourceBox.height - 24);
	for (let index = 1; index < targetCards.length; index += 1) {
		expect(targetCards[index].top).toBeGreaterThanOrEqual(targetCards[index - 1].bottom - 1);
	}
	await expect(source).toHaveCSS("opacity", "0");
	await page.mouse.up();
});

test("跨列让位时相邻卡片经过多个动画帧移动", async ({ page }) => {
	await openPrototypeBoard(page);

	const source = taskCard(page, 0, "设计看板原型四个方向");
	const target = taskCard(page, 1, "实现登录页品牌时刻");
	const sourceBox = (await source.boundingBox())!;
	const targetBox = (await target.boundingBox())!;
	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 4, sourceBox.y + sourceBox.height / 2 + 10, { steps: 3 });
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.25, { steps: 12 });

	const animation = await page.locator(".kanso-drag-placeholder").evaluate((node) => {
		const style = getComputedStyle(node);
		return { name: style.animationName, duration: style.animationDuration };
	});
	// 占位是稳定的真实布局节点，不再通过 max-height 动画制造碰撞区域。
	expect(animation.name).toBe("none");
	expect(parseFloat(animation.duration)).toBe(0);
	await page.mouse.up();
});

test("跨列拖到第三张上方时只让第三张及后续卡片让位", async ({ page }) => {
	await openPrototypeBoard(page);

	const source = taskCard(page, 0, "设计看板原型四个方向");
	const third = taskCard(page, 1, "API 缝测试 21 个全绿");
	const targetColumn = page.locator("div[class*='w-[282px]']").nth(1);
	const sourceBox = (await source.boundingBox())!;
	const thirdBox = (await third.boundingBox())!;
	const titles = ["实现登录页品牌时刻", "看板页领域 hooks 重构", "API 缝测试 21 个全绿"];
	const before = await targetColumn.locator(".kanso-task-card").evaluateAll((cards, expectedTitles) =>
		expectedTitles.map((title) => {
			const card = cards.find((item) => item.querySelector(".kanso-task-card__title")?.textContent === title)!;
			return card.getBoundingClientRect().top;
		}), titles,
	);

	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 4, sourceBox.y + sourceBox.height / 2 + 10, { steps: 3 });
	await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height * 0.2, { steps: 12 });
	await page.waitForTimeout(40);

	const during = await targetColumn.locator(".kanso-task-card").evaluateAll((cards, expectedTitles) =>
		expectedTitles.map((title) => {
			const card = cards.find((item) => item.querySelector(".kanso-task-card__title")?.textContent === title)!;
			return card.getBoundingClientRect().top;
		}), titles,
	);

	// 第三张上方的占位不能把它之前的两张卡片一起推下去。
	expect(Math.abs(during[0] - before[0])).toBeLessThan(2);
	expect(Math.abs(during[1] - before[1])).toBeLessThan(2);
	expect(during[2]).toBeGreaterThan(before[2] + 1);
	await page.mouse.up();
});

test("同列向下穿过多张卡片时按顺序错峰让位", async ({ page }) => {
	await openPrototypeBoard(page);
	const source = taskCard(page, 0, "设计看板原型四个方向");
	const second = taskCard(page, 0, "确定配色与字体体系");
	const third = taskCard(page, 0, "梳理拖拽交互细节");
	const sourceBox = (await source.boundingBox())!;
	const secondBox = (await second.boundingBox())!;
	const thirdBox = (await third.boundingBox())!;
	const read = () => page.locator("div[class*='w-[282px]']").nth(0).locator(".kanso-task-card").evaluateAll((cards) =>
		cards.map((card) => {
			const rect = card.getBoundingClientRect();
			return { title: card.querySelector(".kanso-task-card__title")?.textContent, top: rect.top, transform: getComputedStyle(card).transform, delay: getComputedStyle(card).transitionDelay };
		}),
	);
	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 4, sourceBox.y + sourceBox.height / 2 + 10, { steps: 3 });
	await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height * 0.75, { steps: 8 });
	await page.waitForTimeout(40);
	await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height * 0.2, { steps: 8 });
	await page.waitForTimeout(40);
	const during = await read();
	const secondDelay = parseFloat(during[1].delay || "0");
	const thirdDelay = parseFloat(during[2].delay || "0");
	// 让位顺序由碰撞中线决定，不再使用随距离累加的视觉延迟。
	expect(secondDelay).toBe(0);
	expect(thirdDelay).toBe(0);
	await page.mouse.up();
});

test("列拖拽排序：把第一列拖到末尾", async ({ page }) => {
	await openPrototypeBoard(page);

	const colNames = () =>
		page
			.locator("div[class*='w-[282px]'] .kanso-board-column__title > span.min-w-0")
			.allTextContents();
	await expect.poll(() => colNames(), { timeout: 5000 }).toHaveLength(4);
	expect(await colNames()).toEqual(["待办", "进行中", "已阻塞", "已完成"]);

	const firstCol = page.locator("div[class*='w-[282px]']").nth(0);
	const lastCol = page.locator("div[class*='w-[282px]']").nth(3);
	// 列头是拖拽把手区（含 GripVerticalIcon 的行）。
	// 列头是拖拽把手区（含 GripVerticalIcon 的行；任务卡同为 cursor-grab，需用 items-center 区分列头）。
	const firstColHead = firstCol.locator("button[aria-label^='拖拽列']");
	const lastColHead = lastCol.locator("button[aria-label^='拖拽列']");
	await dragTo(page, firstColHead, lastColHead);

	await expect
		.poll(() => colNames(), { timeout: 5000 })
		.toEqual(["进行中", "已阻塞", "已完成", "待办"]);
});
