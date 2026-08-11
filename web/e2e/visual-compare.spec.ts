// 原型（temp/kanso-ui-prototype-full.html）vs 当前前端：全页面截图 + 关键元素尺寸量化对比。
// 截图输出到 web/screenshots/，尺寸对比汇总到 screenshots/visual-compare.json。
// 对齐标准：差异 ≤ 2px 或肉眼不可辨（ticket 07）。
import { expect, test, type Page } from "@playwright/test";
import { resetAndSeed } from "./seed";

test.beforeEach(async () => { await resetAndSeed(); });

const PROTOTYPE = "file:///F:/golang/kanso/temp/kanso-ui-prototype-full.html";

async function loginToApp(page: Page): Promise<void> {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
}

// proto 侧切到 shell 视图（projects 默认）。
async function protoShell(page: Page, view: string): Promise<void> {
	await page.goto(PROTOTYPE);
	await page.evaluate(
		(v) =>
			(window as unknown as { go: (a: string, b: string) => void }).go(
				"shell",
				v,
			),
		view,
	);
}

test("登录页截图对比", async ({ page }) => {
	await page.goto(PROTOTYPE);
	await page.waitForSelector("#login .form-side");
	await page.screenshot({ path: "screenshots/proto-login.png" });

	await page.goto("/login");
	await page.waitForSelector("#access-key");
	await page.screenshot({ path: "screenshots/app-login.png" });
});

test("项目列表截图 + 卡片尺寸对比", async ({ page }) => {
	await protoShell(page, "projects");
	await page.waitForSelector(".proj-card", { state: "attached" });
	await page.waitForTimeout(100);
	await page.screenshot({ path: "screenshots/proto-projects.png" });
	const proto = await page
		.locator(".proj-card")
		.first()
		.evaluate((el) => {
			const card = (el as HTMLElement).getBoundingClientRect();
			const size = (sel: string) => {
				const n = el.querySelector(sel) as HTMLElement | null;
				if (!n) return null;
				const r = n.getBoundingClientRect();
				return { w: Math.round(r.width), h: Math.round(r.height) };
			};
			return {
				card: { w: Math.round(card.width), h: Math.round(card.height) },
				name: size(".name"),
				meta: size(".meta"),
				counts: size(".counts"),
			};
		});

	await loginToApp(page);
	await page.waitForSelector('a[href*="/p/"]');
	await page.screenshot({ path: "screenshots/app-projects.png" });
	const app = await page
		.locator('a[href*="/p/"]')
		.first()
		.evaluate((el) => {
			const card = (el as HTMLElement).getBoundingClientRect();
			const lines = el.querySelectorAll("p");
			const pills = el.querySelector("div.flex.gap-2");
			const size = (n: Element | null) => {
				if (!n) return null;
				const r = n.getBoundingClientRect();
				return { w: Math.round(r.width), h: Math.round(r.height) };
			};
			return {
				card: { w: Math.round(card.width), h: Math.round(card.height) },
				name: size(lines[0] ?? null),
				meta: size(lines[1] ?? null),
				counts: size(pills),
			};
		});

	const fs = await import("node:fs");
	fs.writeFileSync(
		"screenshots/card-compare.json",
		JSON.stringify(
			{ proto, app, heightDiffPx: (app.card.h ?? 0) - (proto.card.h ?? 0) },
			null,
			2,
		),
	);
});

// —— 其余页面：截图 + 每页一个关键尺寸对比，汇总到 visual-compare.json ——
type SizeFn = (el: Element) => Record<string, number | null>;
const extraPages: { name: string; protoView: string; protoWait: string; appPath: string; appWait: string; protoSize: SizeFn; appSize: SizeFn }[] = [
	{
		name: "board",
		protoView: "board",
		protoWait: ".col",
		appPath: "/w/{ws}/p/{p}",
		appWait: "div[class*='w-[280px]']",
		protoSize: (el: Element) => {
			const col = (el as HTMLElement).getBoundingClientRect();
			const card = el.querySelector(".card")?.getBoundingClientRect();
			return {
				colW: Math.round(col.width),
				colH: Math.round(col.height),
				cardH: card ? Math.round(card.height) : null,
			};
		},
		appSize: (el: Element) => {
			const col = (el as HTMLElement).getBoundingClientRect();
			const card = el.querySelector("p.break-words")?.parentElement;
			return {
				colW: Math.round(col.width),
				colH: Math.round(col.height),
				cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
			};
		},
	},
	{
		name: "detail",
		protoView: "detail",
		protoWait: "#detail h2",
		appPath: "/w/{ws}/p/{p}/t/{t}",
		// 对齐原型后：header 的 h1 是项目名，任务标题是正文首个 h2（与 protoWait 的 #detail h2 对应）。
		appWait: "main h2",
		protoSize: (el: Element) => {
			const h = (el as HTMLElement).getBoundingClientRect();
			return { titleH: Math.round(h.height) };
		},
		appSize: (el: Element) => {
			const h = (el as HTMLElement).getBoundingClientRect();
			return { titleH: Math.round(h.height) };
		},
	},
	{
		name: "dashboard",
		protoView: "dashboard",
		protoWait: ".stat-card",
		appPath: "/dashboard",
		appWait: "main",
		protoSize: () => ({}),
		appSize: () => ({}),
	},
	{
		name: "labels",
		protoView: "labels",
		protoWait: ".create-row",
		appPath: "/w/{ws}/labels",
		appWait: "form",
		protoSize: (el: Element) => {
			const row = (el as HTMLElement).getBoundingClientRect();
			const input = el.querySelector("input")?.getBoundingClientRect();
			return {
				rowH: Math.round(row.height),
				inputW: input ? Math.round(input.width) : null,
			};
		},
		appSize: (el: Element) => {
			const row = (el as HTMLElement).getBoundingClientRect();
			const input = el.querySelector("input")?.getBoundingClientRect();
			return {
				rowH: Math.round(row.height),
				inputW: input ? Math.round(input.width) : null,
			};
		},
	},
	{
		name: "activity",
		protoView: "activity",
		protoWait: "#activity .a-item",
		appPath: "/activity",
		appWait: "main li",
		protoSize: (el: Element) => {
			const r = (el as HTMLElement).getBoundingClientRect();
			return { itemH: Math.round(r.height) };
		},
		appSize: (el: Element) => {
			const r = (el as HTMLElement).getBoundingClientRect();
			return { itemH: Math.round(r.height) };
		},
	},
	{
		name: "settings",
		protoView: "settings",
		protoWait: "#settings .panel",
		appPath: "/settings",
		appWait: "main",
		protoSize: () => ({}),
		appSize: () => ({}),
	},
] as const;

test.describe("全页面截图与关键尺寸对比", () => {
	for (const p of extraPages) {
		test(`${p.name} 截图 + 尺寸对比`, async ({ page }) => {
			await protoShell(page, p.protoView);
			await page.waitForSelector(p.protoWait, { state: "attached" });
			await page.waitForTimeout(100); // 视图切换动画/渲染
			await page.screenshot({ path: `screenshots/proto-${p.name}.png` });
			const proto = await page
				.locator(p.protoWait)
				.first()
				.evaluate(p.protoSize);

			await loginToApp(page);
			// 解析路径模板：{ws}/{p}/{t} 从真实数据取。
			await page.waitForSelector('a[href*="/p/"]');
			let appPath: string = p.appPath;
			if (appPath.includes("{ws}")) {
				const wsHref = await page
					.locator('a[href*="/w/"]')
					.first()
					.getAttribute("href");
				const ws = wsHref?.split("/w/")[1]?.split("/")[0] ?? "";
				appPath = appPath.replace("{ws}", ws);
			}
			if (appPath.includes("{p}")) {
				// 优先「原型演示」项目（与原型 board 数据一致），不存在则回退第一个。
				const card = page.locator('a[href*="/p/"]', { hasText: "原型演示" }).first();
				const target = (await card.count()) > 0
					? card
					: page.locator('a[href*="/p/"]').first();
				const pHref = await target.getAttribute("href");
				const p = pHref?.split("/p/")[1]?.split("/")[0] ?? "";
				appPath = appPath.replace("{p}", p);
			}
			if (appPath.includes("{t}")) {
				// 任务详情：SPA 导航——先进看板点击第一个任务卡片，用当前 URL。
				await page.goto(appPath.replace("/t/{t}", ""));
				await page.waitForSelector("p.break-words");
				await page.locator("p.break-words").first().click();
				await page.waitForURL(/\/t\//);
				appPath = page.url().replace(/^.*?\/w\//, "/w/");
			}
			await page.goto(appPath);
			await page.waitForSelector(p.appWait);
			await page.screenshot({ path: `screenshots/app-${p.name}.png` });
			const app = await page.locator(p.appWait).first().evaluate(p.appSize);

			const fs = await import("node:fs");
			const file = "screenshots/visual-compare.json";
			const prev = fs.existsSync(file)
				? JSON.parse(fs.readFileSync(file, "utf-8"))
				: {};
			prev[p.name] = { proto, app };
			fs.writeFileSync(file, JSON.stringify(prev, null, 2));
		});
	}
});
