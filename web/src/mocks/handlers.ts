// MSW mock handlers：完全对齐后端 REST 路由（ADR-0004 前端自有类型，见 types/）。
// 数据基于真实后端导出的种子（seed-data.ts），运行时 CRUD 修改内存态，刷新页面重置。
// 将来对接后端：删除 main.tsx 中的 mock 启动即可，此处代码与 api.ts 均无需改动。
import { delay, http, HttpResponse } from "msw";
import { seed } from "./seed-data";
import { computeDashboard } from "@/lib/dashboard";
import type { Board } from "@/types/board";
import type { Label } from "@/types/label";
import type { Project } from "@/types/project";
import type { Task } from "@/types/task";
import type { TaskDetail } from "@/types/task-detail";
import type { Workspace } from "@/types/workspace";

// —— 内存态（种子深拷贝；写操作经 persist() 存 localStorage，刷新保留） ——
// seed-data 结构变化时 bump STORAGE_KEY 版本号，避免旧数据残留。
const STORAGE_KEY = "kanso-mock-db-v1";

type Db = {
	workspaces: Workspace[];
	projects: Record<string, Project[]>;
	boards: Record<string, Board>;
	taskDetails: Record<string, TaskDetail>;
	labels: Record<string, Label[]>;
};

function loadDb(): Db {
	try {
		const raw =
			typeof localStorage !== "undefined"
				? localStorage.getItem(STORAGE_KEY)
				: null;
		if (raw) {
			const parsed = JSON.parse(raw) as Db;
			// 结构校验：关键表缺失（版本不符/损坏）时回退种子。
			if (
				parsed &&
				Array.isArray(parsed.workspaces) &&
				parsed.projects &&
				parsed.boards &&
				parsed.taskDetails &&
				parsed.labels
			) {
				return parsed;
			}
		}
	} catch {
		// JSON 损坏或 localStorage 不可用：回退种子。
	}
	return {
		workspaces: structuredClone(seed.workspaces),
		projects: structuredClone(seed.projects) as Record<string, Project[]>,
		boards: structuredClone(seed.boards) as Record<string, Board>,
		taskDetails: structuredClone(seed.taskDetails) as Record<string, TaskDetail>,
		labels: structuredClone(seed.labels) as Record<string, Label[]>,
	};
}

const db = loadDb();

function persist(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
	} catch {
		// 配额超限/隐私模式：忽略，仍以内存态工作。
	}
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 26);

// —— 辅助 ——
function projectSummaries(workspaceId: string): (Project & {
	columnCount: number;
	taskCount: number;
	inProgressCount: number;
})[] {
	return (db.projects[workspaceId] ?? []).map((p, i) => {
		const b = db.boards[p.id];
		// mock 注入模拟 updatedAt（后端暂无此字段；对齐原型 meta"更新于 X"）。
		// 对接后端后由真实 updatedAt 驱动，前端自动展示；缺失则回退显示 createdAt。
		const mockUpdatedAt = new Date(Date.now() - [0, 3, 7, 14][i % 4] * 86_400_000).toISOString();
		return {
			...p,
			updatedAt: mockUpdatedAt,
			columnCount: b?.columns.length ?? 0,
			taskCount: b?.columns.reduce((s, c) => s + c.tasks.length, 0) ?? 0,
			inProgressCount:
				b?.columns.find((c) => c.name === "进行中")?.tasks.length ?? 0,
		};
	});
}

function findTaskInBoards(
	taskId: string,
): { board: Board; column: Board["columns"][number]; index: number } | null {
	for (const board of Object.values(db.boards)) {
		for (const column of board.columns) {
			const index = column.tasks.findIndex((t) => t.id === taskId);
			if (index >= 0) return { board, column, index };
		}
	}
	return null;
}

// 同步任务详情的可变字段：标题/描述由 detail.task 携带；标签走独立的 detail.labels
// 聚合字段（贴/摘标签只改了 board 的 task.labels，不同步这里详情页就会看不到标签）。
function syncTaskDetail(taskId: string, task: Task): void {
	const detail = db.taskDetails[taskId];
	if (detail) {
		detail.task = task;
		detail.labels = task.labels ?? [];
	}
}

// 拍平全部任务的活动流（仪表盘最近活动与活动页共用同一数据源）。
function flattenActivities(): { projectName: string; action: string; createdAt: string }[] {
	const activities: { projectName: string; action: string; createdAt: string }[] = [];
	for (const detail of Object.values(db.taskDetails)) {
		const found = findTaskInBoards(detail.task.id);
		for (const act of detail.activity) {
			activities.push({
				projectName: found?.board.project.name ?? "",
				action: act.action,
				createdAt: act.createdAt,
			});
		}
	}
	return activities;
}

function seedDefaultColumns(projectId: string): void {
	const board = db.boards[projectId];
	if (!board || board.columns.length > 0) return;
	for (const [i, name] of ["待办", "进行中", "已阻塞", "已完成"].entries()) {
		board.columns.push({
			id: uid(),
			projectId,
			name,
			position: i,
			createdAt: now(),
			tasks: [],
		});
	}
}

// —— handlers ——
export const handlers = [
	// 认证：mock 下任意密钥通过（对接后端后此 handler 移除即恢复真校验）。
	http.post("/api/auth/verify", async () => {
		await delay(60);
		return HttpResponse.json({ ok: true });
	}),

	// —— 工作区 ——
	http.get("/api/workspaces", async () => {
		await delay();
		return HttpResponse.json(db.workspaces);
	}),
	http.post("/api/workspaces", async ({ request }) => {
		const body = (await request.json()) as { name?: string };
		const ws: Workspace = {
			id: uid(),
			name: body.name ?? "新工作区",
			createdAt: now(),
		};
		db.workspaces.push(ws);
		db.projects[ws.id] = [];
		db.labels[ws.id] = [];
		persist();
		return HttpResponse.json(ws, { status: 201 });
	}),
	http.patch("/api/workspaces/:id", async ({ params, request }) => {
		const ws = db.workspaces.find((w) => w.id === params.id);
		if (!ws) return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { name?: string };
		if (body.name) ws.name = body.name;
		persist();
		return HttpResponse.json(ws);
	}),
	http.delete("/api/workspaces/:id", async ({ params }) => {
		const id = params.id as string;
		if (!db.workspaces.some((w) => w.id === id))
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		db.workspaces = db.workspaces.filter((w) => w.id !== id);
		for (const p of db.projects[id] ?? []) {
			delete db.boards[p.id];
			for (const b of Object.values(db.boards)) {
				for (const c of b.columns)
					for (const t of c.tasks) delete db.taskDetails[t.id];
			}
		}
		delete db.projects[id];
		delete db.labels[id];
		persist();
		return new HttpResponse(null, { status: 204 });
	}),

	// —— 项目 ——
	http.get("/api/workspaces/:workspaceId/projects", async ({ params }) => {
		await delay();
		return HttpResponse.json(projectSummaries(params.workspaceId as string));
	}),
	http.post(
		"/api/workspaces/:workspaceId/projects",
		async ({ params, request }) => {
			const body = (await request.json()) as { name?: string };
			const project: Project = {
				id: uid(),
				workspaceId: params.workspaceId as string,
				name: body.name ?? "新项目",
				position: 0,
				createdAt: now(),
				updatedAt: now(),
			};
			(db.projects[params.workspaceId as string] ??= []).push(project);
			db.boards[project.id] = {
				project: { ...project },
				columns: [],
				labels: db.labels[params.workspaceId as string] ?? [],
			};
			seedDefaultColumns(project.id);
			return HttpResponse.json(project, { status: 201 });
		},
	),
	http.patch("/api/projects/:id", async ({ params, request }) => {
		const project = findProject(params.id as string);
		if (!project)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { name?: string };
		if (body.name) project.name = body.name;
		const board = db.boards[project.id];
		if (board) board.project = { ...project };
		persist();
		return HttpResponse.json(project);
	}),
	http.delete("/api/projects/:id", async ({ params }) => {
		const id = params.id as string;
		for (const list of Object.values(db.projects)) {
			const i = list.findIndex((p) => p.id === id);
			if (i >= 0) list.splice(i, 1);
		}
		const board = db.boards[id];
		if (board)
			for (const c of board.columns)
				for (const t of c.tasks) delete db.taskDetails[t.id];
		delete db.boards[id];
		persist();
		return new HttpResponse(null, { status: 204 });
	}),
	http.get("/api/projects/:id", async ({ params }) => {
		await delay();
		const board = db.boards[params.id as string];
		if (!board) return HttpResponse.json({ error: "not found" }, { status: 404 });
		return HttpResponse.json(board);
	}),
	// 仪表盘聚合（mock 定义契约；对接后端后由真实聚合端点提供）。
	http.get("/api/dashboard", async () => {
		await delay();
		return HttpResponse.json(
			computeDashboard({ boards: Object.values(db.boards), activities: flattenActivities() }),
		);
	}),
	// 全局活动流（活动页 /activity 数据源；与仪表盘共用拍平逻辑）。
	http.get("/api/activity", async () => {
		await delay();
		return HttpResponse.json(flattenActivities());
	}),
	// 设置页备份导出（mock 下导出内存态快照；对接后端后由真实备份端点提供）。
	http.get("/api/settings/backup", async () => {
		await delay();
		return HttpResponse.json({
			exportedAt: now(),
			workspaces: db.workspaces,
			projects: db.projects,
			boards: db.boards,
			taskDetails: db.taskDetails,
			labels: db.labels,
		});
	}),

	// —— 列 ——
	http.post("/api/projects/:projectId/columns", async ({ params, request }) => {
		const board = db.boards[params.projectId as string];
		if (!board)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { name?: string };
		const column = {
			id: uid(),
			projectId: params.projectId as string,
			name: body.name ?? "新列",
			position: board.columns.length,
			createdAt: now(),
			tasks: [],
		};
		board.columns.push(column);
		persist();
		return HttpResponse.json(column, { status: 201 });
	}),
	http.patch("/api/columns/:id", async ({ params, request }) => {
		const hit = findColumn(params.id as string);
		if (!hit) return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { name?: string; position?: number };
		if (typeof body.name === "string") hit.column.name = body.name;
		if (typeof body.position === "number") {
			const { board, column } = hit;
			const from = board.columns.findIndex((c) => c.id === column.id);
			board.columns.splice(from, 1);
			const to = Math.min(Math.max(body.position, 0), board.columns.length);
			board.columns.splice(to, 0, column);
			board.columns.forEach((c, i) => (c.position = i));
		}
		persist();
		return HttpResponse.json({ ...hit.column, tasks: undefined });
	}),
	http.delete("/api/columns/:id", async ({ params }) => {
		const hit = findColumn(params.id as string);
		if (!hit) return HttpResponse.json({ error: "not found" }, { status: 404 });
		for (const t of hit.column.tasks) delete db.taskDetails[t.id];
		hit.board.columns.splice(
			hit.board.columns.findIndex((c) => c.id === hit.column.id),
			1,
		);
		persist();
		return new HttpResponse(null, { status: 204 });
	}),

	// —— 任务 ——
	http.post("/api/columns/:columnId/tasks", async ({ params, request }) => {
		const hit = findColumn(params.columnId as string);
		if (!hit) return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { title?: string };
		const task: Task = {
			id: uid(),
			projectId: hit.board.project.id,
			columnId: hit.column.id,
			title: body.title ?? "新任务",
			description: null,
			position: hit.column.tasks.length,
			createdAt: now(),
			updatedAt: now(),
		};
		hit.column.tasks.push(task);
		db.taskDetails[task.id] = {
			task: { ...task },
			projectName: hit.board.project.name,
			labels: [],
			comments: [],
			activity: [],
		};
		persist();
		return HttpResponse.json(task, { status: 201 });
	}),
	http.patch("/api/tasks/:id", async ({ params, request }) => {
		const found = findTaskInBoards(params.id as string);
		if (!found)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const { board, column, index } = found;
		const body = (await request.json()) as {
			title?: string;
			description?: string | null;
			columnId?: string;
			position?: number;
		};

		if (typeof body.columnId === "string" && body.columnId !== column.id) {
			// 跨列移动：移除 → 插入目标列目标位 → 重排两列 position。
			const [task] = column.tasks.splice(index, 1);
			const target = board.columns.find((c) => c.id === body.columnId);
			if (!target) {
				column.tasks.splice(index, 0, task);
				return HttpResponse.json({ error: "not found" }, { status: 404 });
			}
			task.columnId = target.id;
			const pos = Math.min(
				Math.max(body.position ?? target.tasks.length, 0),
				target.tasks.length,
			);
			target.tasks.splice(pos, 0, task);
			column.tasks.forEach((t, i) => (t.position = i));
			target.tasks.forEach((t, i) => (t.position = i));
			task.updatedAt = now();
			syncTaskDetail(task.id, task);
			return HttpResponse.json(task);
		}
		if (typeof body.position === "number") {
			// 同列移动。
			const [task] = column.tasks.splice(index, 1);
			const pos = Math.min(Math.max(body.position, 0), column.tasks.length);
			column.tasks.splice(pos, 0, task);
			column.tasks.forEach((t, i) => (t.position = i));
			task.updatedAt = now();
			syncTaskDetail(task.id, task);
			return HttpResponse.json(task);
		}
		// 普通更新（标题/描述）。
		const task = column.tasks[index];
		if (typeof body.title === "string") task.title = body.title;
		if ("description" in body) task.description = body.description ?? null;
		task.updatedAt = now();
		syncTaskDetail(task.id, task);
		persist();
		return HttpResponse.json(task);
	}),
	http.delete("/api/tasks/:id", async ({ params }) => {
		const found = findTaskInBoards(params.id as string);
		if (!found)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		found.column.tasks.splice(found.index, 1);
		found.column.tasks.forEach((t, i) => (t.position = i));
		delete db.taskDetails[params.id as string];
		persist();
		return new HttpResponse(null, { status: 204 });
	}),

	// —— 任务详情 ——
	http.get("/api/tasks/:id", async ({ params }) => {
		await delay();
		const detail = db.taskDetails[params.id as string];
		if (!detail)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		// 注入项目名（与后端聚合响应一致），供详情页面包屑显示。
		const found = findTaskInBoards(detail.task.id);
		return HttpResponse.json({
			...detail,
			projectName: found?.board.project.name ?? "",
		});
	}),
	http.post("/api/tasks/:taskId/comments", async ({ params, request }) => {
		const detail = db.taskDetails[params.taskId as string];
		if (!detail)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const body = (await request.json()) as { content?: string };
		const comment = {
			id: uid(),
			taskId: params.taskId as string,
			content: body.content ?? "",
			createdAt: now(),
		};
		detail.comments.push(comment);
		persist();
		return HttpResponse.json(comment, { status: 201 });
	}),
	http.delete("/api/comments/:id", async ({ params }) => {
		for (const detail of Object.values(db.taskDetails)) {
			const i = detail.comments.findIndex((c) => c.id === params.id);
			if (i >= 0) {
				detail.comments.splice(i, 1);
				return new HttpResponse(null, { status: 204 });
			}
		}
		persist();
		return HttpResponse.json({ error: "not found" }, { status: 404 });
	}),

	// —— 标签 ——
	http.get("/api/workspaces/:workspaceId/labels", async ({ params }) => {
		await delay();
		const list = db.labels[params.workspaceId as string] ?? [];
		// 统计每个标签的使用任务数（对齐原型"N 个任务"）。
		const counts = new Map<string, number>();
		for (const board of Object.values(db.boards))
			for (const column of board.columns)
				for (const task of column.tasks)
					for (const l of task.labels ?? [])
						counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
		return HttpResponse.json(list.map((l) => ({ ...l, taskCount: counts.get(l.id) ?? 0 })));
	}),
	http.post(
		"/api/workspaces/:workspaceId/labels",
		async ({ params, request }) => {
			const body = (await request.json()) as { name?: string; color?: string };
			const label: Label = {
				id: uid(),
				workspaceId: params.workspaceId as string,
				name: body.name ?? "新标签",
				color: body.color ?? "#2563eb",
				createdAt: now(),
			};
			(db.labels[params.workspaceId as string] ??= []).push(label);
			const board = Object.values(db.boards).find(
				(b) => b.project.workspaceId === params.workspaceId,
			);
			if (board) board.labels = db.labels[params.workspaceId as string] ?? [];
			return HttpResponse.json(label, { status: 201 });
		},
	),
	http.patch("/api/labels/:id", async ({ params, request }) => {
		for (const list of Object.values(db.labels)) {
			const label = list.find((l) => l.id === params.id);
			if (label) {
				const body = (await request.json()) as {
					name?: string;
					color?: string;
				};
				if (typeof body.name === "string") label.name = body.name;
				if (typeof body.color === "string") label.color = body.color;
				return HttpResponse.json(label);
			}
		}
		persist();
		return HttpResponse.json({ error: "not found" }, { status: 404 });
	}),
	http.delete("/api/labels/:id", async ({ params }) => {
		for (const list of Object.values(db.labels)) {
			const i = list.findIndex((l) => l.id === params.id);
			if (i >= 0) {
				list.splice(i, 1);
				return new HttpResponse(null, { status: 204 });
			}
		}
		persist();
		return HttpResponse.json({ error: "not found" }, { status: 404 });
	}),
	http.post("/api/tasks/:taskId/labels/:labelId", async ({ params }) => {
		const { taskId, labelId } = params as { taskId: string; labelId: string };
		const found = findTaskInBoards(taskId);
		const label = Object.values(db.labels)
			.flat()
			.find((l) => l.id === labelId);
		if (!found || !label)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const task = found.column.tasks[found.index];
		task.labels ??= [];
		if (!task.labels.some((l) => l.id === labelId)) task.labels.push(label);
		syncTaskDetail(taskId, task);
		persist();
		return new HttpResponse(null, { status: 204 });
	}),
	http.delete("/api/tasks/:taskId/labels/:labelId", async ({ params }) => {
		const { taskId, labelId } = params as { taskId: string; labelId: string };
		const found = findTaskInBoards(taskId);
		if (!found)
			return HttpResponse.json({ error: "not found" }, { status: 404 });
		const task = found.column.tasks[found.index];
		task.labels = (task.labels ?? []).filter((l) => l.id !== labelId);
		syncTaskDetail(taskId, task);
		persist();
		return new HttpResponse(null, { status: 204 });
	}),
];

// —— 内部查找 ——
function findProject(projectId: string): Project | null {
	for (const list of Object.values(db.projects))
		for (const p of list) if (p.id === projectId) return p;
	return null;
}

function findColumn(columnId: string): {
	board: Board;
	column: Board["columns"][number];
} | null {
	for (const board of Object.values(db.boards)) {
		const column = board.columns.find((c) => c.id === columnId);
		if (column) return { board, column };
	}
	return null;
}
