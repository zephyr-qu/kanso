// 落地页产品截图抓取（开发期工具，产物提交到 apps/landing/media）。
// 用真实后端 + 真实前端产出截图，替代手绘假界面（设计规范禁止 div 假截图）。
//
// 用法：
//   1) pnpm --dir web build                     # 服务端 embed 的 dist 必须是最新构建
//   2) KANSO_DATA_DIR=./temp/shots-data KANSO_ACCESS_KEY=shots-key go run ./cmd/kanso serve
//   3) pnpm --dir web exec node tools/capture-landing-shots.mjs [--theme dark]
//
// 每张图都是 1440 宽、deviceScaleFactor 2，对应落地页里的一个版面槽位。
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const API = process.env.KANSO_API_URL ?? "http://127.0.0.1:8080";
const KEY = process.env.KANSO_ACCESS_KEY ?? "shots-key";
const themeArg = process.argv.indexOf("--theme");
const THEME = themeArg === -1 ? "light" : process.argv[themeArg + 1];
const OUT_DIR = path.resolve(import.meta.dirname, "../../apps/landing/media");

// 可展示的种子内容：真实感的中文项目与任务（不要测试用的占位数据）。
// 四个默认列都要有内容，否则截图里会出现空列与空状态提示。
const PROJECTS = [
	{
		name: "Kanso 0.6",
		labels: ["前端", "后端", "设计", "文档"],
		tasks: {
			待办: [
				{ title: "看板列宽随窗口自适应", description: "窄屏下列宽塌陷，改为按视口比例分配", priority: "high", dueDate: "2026-10-21", labels: ["前端"] },
				{ title: "CSV 导出字段与列表视图对齐", description: "导出列顺序跟随当前列表视图", priority: "med", dueDate: "2026-10-24", labels: ["文档"] },
				{ title: "归档任务批量恢复", description: "归档列表支持多选后一次恢复", priority: "low", labels: ["后端"] },
			],
			进行中: [
				{ title: "泳道按标签横向分组", description: "WIP 超限时按标签拆泳道，减少切换", priority: "urgent", dueDate: "2026-10-18", labels: ["前端", "设计"], milestone: true },
				{ title: "Quick Capture 全局快捷键", description: "无输入焦点时唤起快速捕获", priority: "high", dueDate: "2026-10-19", labels: ["前端"] },
				{ title: "AI 捕获结果落库前可编辑", description: "分析出的任务先预览，逐条改写后再创建", priority: "high", labels: ["后端"] },
			],
			已阻塞: [
				{ title: "导出接口等待鉴权口径确认", description: "密钥颗粒度定下来再合并导出分支", priority: "high", labels: ["后端"] },
			],
			已完成: [
				{ title: "WebSocket 断线重连退避", description: "连接关闭后指数退避重连，避免打满限流", priority: "med", labels: ["后端"], milestone: true },
				{ title: "里程碑进度口径修正", description: "归档的已完成任务继续计入进度", priority: "high", labels: ["后端"] },
				{ title: "看板拖拽乐观更新", description: "跨列移动先本地落位，再与服务端对齐", priority: "urgent", labels: ["前端"] },
			],
		},
	},
	{
		name: "官网改版",
		labels: ["前端", "设计"],
		tasks: {
			待办: [
				{ title: "首屏替换为真实产品截图", description: "去掉手绘示意图，抓真实应用画面", priority: "high", labels: ["设计"] },
			],
			进行中: [
				{ title: "深色模式跟随系统", description: "prefers-color-scheme 驱动同一套变量", priority: "med", labels: ["前端"] },
			],
			已阻塞: [],
			已完成: [],
		},
	},
];

const ADMIN_NAME = "陈屿";

async function api(pathname, init = {}) {
	const res = await fetch(`${API}${pathname}`, {
		...init,
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
	if (!res.ok) {
		throw new Error(`API ${pathname} → ${res.status}: ${await res.text()}`);
	}
	return res.status === 204 ? null : res.json();
}

async function resetWorkspace() {
	const workspaces = await api("/api/workspaces");
	const ws = workspaces[0] ?? (await api("/api/workspaces", { method: "POST", body: JSON.stringify({ name: "产品工作区" }) }));
	for (const project of await api(`/api/workspaces/${ws.id}/projects`)) {
		await api(`/api/projects/${project.id}`, { method: "DELETE" });
	}
	for (const extra of workspaces.slice(1)) {
		await api(`/api/workspaces/${extra.id}`, { method: "DELETE" });
	}
	await api(`/api/workspaces/${ws.id}`, { method: "PATCH", body: JSON.stringify({ name: "产品工作区" }) });
	return ws;
}

/** 个人模式下只有一个管理员，改成本名，避免截图里出现默认的 Admin。 */
async function renameAdmin() {
	const payload = await api("/api/members");
	const members = Array.isArray(payload) ? payload : (payload.members ?? []);
	if (members[0]) {
		await api(`/api/members/${members[0].id}`, { method: "PATCH", body: JSON.stringify({ name: ADMIN_NAME }) });
	}
}

async function seed(ws) {
	const result = {};
	for (const spec of PROJECTS) {
		const project = await api(`/api/workspaces/${ws.id}/projects`, {
			method: "POST",
			body: JSON.stringify({ name: spec.name }),
		});
		const labelIds = new Map();
		for (const name of spec.labels) {
			const label = await api(`/api/projects/${project.id}/labels`, {
				method: "POST",
				body: JSON.stringify({ name }),
			});
			labelIds.set(name, label.id);
		}
		// 里程碑：让看板头部显示真实进度，而不是「暂无里程碑」提示条。
		const milestone = await api(`/api/projects/${project.id}/milestones`, {
			method: "POST",
			body: JSON.stringify({ name: "0.6 发布", dueDate: "2026-10-31" }),
		});
		const firstTask = {};
		for (const [columnName, tasks] of Object.entries(spec.tasks)) {
			const board = await api(`/api/projects/${project.id}`);
			const column = board.columns.find((c) => c.name === columnName);
			if (!column) throw new Error(`项目 ${spec.name} 缺少列 ${columnName}`);
			for (const task of tasks) {
				const created = await api(`/api/columns/${column.id}/tasks`, {
					method: "POST",
					body: JSON.stringify({
						title: task.title,
						description: task.description ?? null,
						priority: task.priority,
						dueDate: task.dueDate ?? null,
					}),
				});
				for (const labelName of task.labels ?? []) {
					await api(`/api/tasks/${created.id}/labels/${labelIds.get(labelName)}`, { method: "POST" });
				}
				if (task.milestone) {
					await api(`/api/tasks/${created.id}/milestones/${milestone.id}`, { method: "POST" });
				}
				if (!firstTask[columnName]) firstTask[columnName] = created.id;
			}
		}
		result[spec.name] = { id: project.id, firstTask };
	}
	return result;
}

async function launchBrowser() {
	const attempts = [{ channel: "chrome" }, {}];
	let lastError;
	for (const options of attempts) {
		try {
			return await chromium.launch(options);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true });
	const ws = await resetWorkspace();
	// 先改名再播种：活动记录写的是当时的名字，顺序反了截图里就会是「Admin」。
	await renameAdmin();
	const seeded = await seed(ws);
	const primary = seeded["Kanso 0.6"];
	if (!primary) throw new Error("主项目未创建成功");

	const browser = await launchBrowser();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		locale: "zh-CN",
	});
	// 主题由 localStorage 决定（web/src/lib/theme.ts 的 kanso.theme）。
	await context.addInitScript((theme) => {
		window.localStorage.setItem("kanso.theme", theme);
	}, THEME);
	const page = await context.newPage();

	await page.goto(`${API}/login`);
	await page.fill("#access-key", KEY);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL(/\/w\/[^/]+\/dashboard/);

	const shots = [
		// 局部特写构图：页面上这两张的展示宽度只有 600-770px，截取范围就收到同量级，
		// 让应用里的 13px 字在页面上接近 1:1（整屏 1440 缩到 43% 会糊成一团）。
		// 顺带也切掉了看板底部的空白画布与快捷键条（⌘K 在 Windows 上字形回退成「8K」）。
		// 1440 视口下量到的坐标：列 226..508 / 522..804 / 818..1100 / 1114..1396，抽屉 900..1420。
		// 裁切边界全部取在列间空隙（210 / 806 / 804..818），别落在卡片或文字中间。
		{ name: "app-board", route: `/w/${ws.id}/p/${primary.id}`, waitForText: "泳道按标签横向分组", clip: { x: 210, y: 0, width: 600, height: 490 } },
		{ name: "app-task", route: `/w/${ws.id}/p/${primary.id}/t/${primary.firstTask["进行中"]}`, waitForText: "WIP 超限时按标签拆泳道", clip: { x: 806, y: 20, width: 634, height: 420 } },
	];
	const suffix = THEME === "dark" ? "-dark" : "";
	for (const shot of shots) {
		await page.goto(`${API}${shot.route}`);
		if (shot.waitForText) await page.getByText(shot.waitForText).first().waitFor();
		else await page.waitForTimeout(1500);
		await page.waitForTimeout(700);
		const file = path.join(OUT_DIR, `${shot.name}${suffix}.png`);
		await page.screenshot({ path: file, clip: shot.clip ?? undefined });
		const { size } = await fs.stat(file);
		console.log(`${path.relative(process.cwd(), file)}  ${(size / 1024).toFixed(0)} KB`);
	}

	await browser.close();
}

await main();
