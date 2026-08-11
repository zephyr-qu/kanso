// E2E 数据重置与种子：真后端是共享库，这里在测试前通过 API 把库重置为已知状态，
// 复现「每测试干净起点」。
import type { Page } from "@playwright/test";

const BASE = process.env.KANSO_API_URL ?? "http://localhost:8080";

// 命名种子：E2E 各 spec 依赖的项目名。
// 任务对象支持 description：原型 demo board 的卡片含描述，种子需对齐才能让
// visual-compare 的 cardH/colH 尺寸对比达标（差异 ≤2px）。
const SEED_PROJECTS = [
	{
		name: "看板冒烟",
		// 待办列 2 个任务（delete-confirm 任务/列删除、smoke、task-detail 用）。
		todo: [{ title: "faf faf", description: null }, { title: "fafw", description: null }],
		inProgress: [],
	},
	{
		name: "原型演示",
		// 待办列 3 个精确标题任务（sort.spec 断言标题序列）；进行中 4 任务对齐原型 demo board
		// （visual-compare 的 colH/cardH 对比需要与原型 board 数据量一致）。
		todo: [
			{ title: "设计看板原型四个方向", description: "终端、杂志、便签、禅——结构差异不是换皮" },
			{ title: "确定配色与字体体系", description: "离线部署，自托管字体内嵌" },
			{ title: "梳理拖拽交互细节", description: "乐观更新与回滚已就绪" },
		],
		inProgress: [
			{ title: "实现登录页品牌时刻", description: null },
			{ title: "看板页领域 hooks 重构", description: null },
			{ title: "API 缝测试 21 个全绿", description: null },
			{ title: "WebSocket 实时同步", description: null },
		],
	},
	{
		name: "标签冒烟",
		// 待办列「带标签」任务 + 工作区标签（前端/紧急/设计），labels.spec 贴「紧急」。
		todo: [{ title: "带标签", description: null }],
		inProgress: [],
	},
] as const;

// 工作区级标签（labels.spec 断言「紧急」徽章；misc 断言 dashboard 统计含「紧急」）。
const SEED_LABELS = [
	{ name: "前端", color: "#3b82f6" },
	{ name: "紧急", color: "#ef4444" },
	{ name: "设计", color: "#8b5cf6" },
] as const;

async function api(path: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${process.env.KANSO_ACCESS_KEY ?? "mock-key"}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	if (!res.ok) {
		throw new Error(`API ${path} → ${res.status}: ${await res.text()}`);
	}
	return res;
}

// 重置：删除所有工作区（级联项目/列/任务/标签/活动），重建默认工作区与种子数据。
export async function resetAndSeed(): Promise<void> {
	// 1. 删除全部工作区。
	const wsRes = await api("/api/workspaces");
	if (wsRes.ok) {
		const workspaces = (await wsRes.json()) as { id: string }[];
		for (const ws of workspaces) {
			const r = await api(`/api/workspaces/${ws.id}`, { method: "DELETE" });
			if (!r.ok && r.status !== 404)
				throw new Error(`删除工作区失败: ${r.status}`);
		}
	}

	// 2. 重建默认工作区。
	const created = await api("/api/workspaces", {
		method: "POST",
		body: JSON.stringify({ name: "默认工作区" }),
	});
	if (!created.ok) throw new Error(`创建工作区失败: ${created.status}`);
	const ws = (await created.json()) as { id: string };

	// 3. 工作区级标签。
	const labelIds = new Map<string, string>();
	for (const l of SEED_LABELS) {
		const r = await api(`/api/workspaces/${ws.id}/labels`, {
			method: "POST",
			body: JSON.stringify({ name: l.name, color: l.color }),
		});
		if (r.ok) {
			const label = (await r.json()) as { id: string; name: string };
			labelIds.set(label.name, label.id);
		}
	}

	// 4. 命名项目（创建自动种子默认列 待办/进行中/已阻塞/已完成）。
	for (const p of SEED_PROJECTS) {
		const r = await api(`/api/workspaces/${ws.id}/projects`, {
			method: "POST",
			body: JSON.stringify({ name: p.name }),
		});
		if (!r.ok) throw new Error(`创建项目 ${p.name} 失败: ${r.status}`);
		const project = (await r.json()) as { id: string };
		const boardRes = await api(`/api/projects/${project.id}`);
		const board = (await boardRes.json()) as {
			columns: { id: string; name: string }[];
		};
		const todo = board.columns.find((c) => c.name === "待办");
		const inProgress = board.columns.find((c) => c.name === "进行中");
		if (!todo || !inProgress) {
			throw new Error(`项目 ${p.name} 缺少默认列`);
		}
		for (const t of p.todo) {
			await api(`/api/columns/${todo.id}/tasks`, {
				method: "POST",
				body: JSON.stringify({ title: t.title, description: t.description }),
			});
		}
		for (const t of p.inProgress) {
			await api(`/api/columns/${inProgress.id}/tasks`, {
				method: "POST",
				body: JSON.stringify({ title: t.title, description: t.description }),
			});
		}
	}

	// 5. 贴标签：给「标签冒烟」的「带标签」任务贴「前端」；给「原型演示」待办 3 任务贴
	//    「前端/设计」徽章（对齐原型 demo board 卡片高度，visual-compare cardH 对比需要）。
	const wsAgain = (await (await api("/api/workspaces")).json()) as {
		id: string;
	}[];
	const smokeWs = wsAgain[0];
	if (smokeWs) {
		const projs = (await (
			await api(`/api/workspaces/${smokeWs.id}/projects`)
		).json()) as { id: string; name: string }[];
		const smoke = projs.find((p) => p.name === "标签冒烟");
		if (smoke) {
			const board = (await (await api(`/api/projects/${smoke.id}`)).json()) as {
				columns: { id: string; name: string; tasks: { id: string }[] }[];
			};
			const todo = board.columns.find((c) => c.name === "待办");
			const task = todo?.tasks[0];
			const frontend = labelIds.get("前端");
			if (task && frontend) {
				await api(`/api/tasks/${task.id}/labels/${frontend}`, {
					method: "POST",
				});
			}
		}
		const demo = projs.find((p) => p.name === "原型演示");
		if (demo) {
			const board = (await (await api(`/api/projects/${demo.id}`)).json()) as {
				columns: { id: string; name: string; tasks: { id: string }[] }[];
			};
			const todo = board.columns.find((c) => c.name === "待办");
			const frontend = labelIds.get("前端");
			const design = labelIds.get("设计");
			for (const task of todo?.tasks ?? []) {
				if (frontend) {
					await api(`/api/tasks/${task.id}/labels/${frontend}`, {
						method: "POST",
					});
				}
				if (design) {
					await api(`/api/tasks/${task.id}/labels/${design}`, {
						method: "POST",
					});
				}
			}
		}
	}
}

// 测试内登录（各 spec 已有 loginToApp，这里供新 spec 复用）。
export async function loginToApp(page: Page): Promise<void> {
	const key = process.env.KANSO_ACCESS_KEY ?? "mock-key";
	await page.goto("/login");
	await page.fill("#access-key", key);
	await page.getByRole("button", { name: "进入" }).click();
	await page.waitForURL((u) => u.pathname !== "/login");
}

// 每测试重置：spec 顶部 `test.beforeEach(async () => { await resetAndSeed(); });`
