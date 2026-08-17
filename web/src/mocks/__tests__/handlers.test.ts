import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { resetMockDb } from "@/mocks/mock-db";

const json = async <T>(
	path: string,
	init?: RequestInit,
): Promise<{ response: Response; body: T }> => {
	const response = await fetch(`http://localhost${path}`, init);
	return { response, body: (await response.json()) as T };
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	server.resetHandlers();
	resetMockDb();
});
afterAll(() => server.close());

describe("Mock REST contract", () => {
	it("supports workspace/project/board creation without a Go server", async () => {
		const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
		expect(workspaces.response.status).toBe(200);
		const created = await json<{ id: string }>("/api/workspaces", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "设计工作区" }),
		});
		expect(created.response.status).toBe(201);
		const projects = await json<Array<{ id: string }>>(
			`/api/workspaces/${created.body.id}/projects`,
		);
		expect(projects.body).toEqual([]);
	});

	it("keeps task detail, labels, comments and activities consistent", async () => {
		const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
		const projects = await json<Array<{ id: string }>>(
			`/api/workspaces/${workspaces.body[0].id}/projects`,
		);
		const board = await json<{
			columns: Array<{ id: string; tasks: Array<{ id: string }> }>;
		}>(`/api/projects/${projects.body[0].id}`);
		const task = await json<{ id: string }>(
			`/api/columns/${board.body.columns[0].id}/tasks`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "契约任务" }),
			},
		);
		const comment = await json<{ author: string }>(
			`/api/tasks/${task.body.id}/comments`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "Mock 评论" }),
			},
		);
		expect(comment.body.author).toBe("Admin");
		const detail = await json<{
			task: { title: string };
			comments: unknown[];
			activity: Array<{ action: string }>;
		}>(`/api/tasks/${task.body.id}`);
		expect(detail.body.task.title).toBe("契约任务");
		expect(detail.body.comments).toHaveLength(1);
		expect(
			detail.body.activity.some((item) => item.action === "comment.created"),
		).toBe(true);
	});

	it("supports archive/restore and milestone association", async () => {
		const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
		const projects = await json<Array<{ id: string }>>(
			`/api/workspaces/${workspaces.body[0].id}/projects`,
		);
		const projectId = projects.body[0].id;
		const board = await json<{ columns: Array<{ id: string }> }>(
			`/api/projects/${projectId}`,
		);
		const task = await json<{ id: string }>(
			`/api/columns/${board.body.columns[0].id}/tasks`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "归档任务" }),
			},
		);
		const archived = await json<{ archivedAt: string | null }>(
			`/api/tasks/${task.body.id}/archive`,
			{ method: "POST" },
		);
		expect(archived.body.archivedAt).toBeTruthy();
		const milestone = await json<{ id: string }>(
			`/api/projects/${projectId}/milestones`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "第一阶段" }),
			},
		);
		const linked = await fetch(
			`http://localhost/api/tasks/${task.body.id}/milestones/${milestone.body.id}`,
			{ method: "POST" },
		);
		expect(linked.status).toBe(204);
	});
});

it("supports member create/delete with owner protection and 5-person limit", async () => {
	const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
	const workspaceId = workspaces.body[0].id;
	// 创建成员（默认角色 member）
	const created = await json<{ id: string; role: string }>("/api/members", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ workspaceId, name: "新成员" }),
	});
	expect(created.response.status).toBe(201);
	expect(created.body.role).toBe("member");
	let members = await json<Array<{ id: string }>>(
		`/api/workspaces/${workspaceId}/members`,
	);
	expect(members.body).toHaveLength(4);
	// 删除成员 → 204 且列表回落
	const removed = await fetch(
		`http://localhost/api/members/${created.body.id}`,
		{ method: "DELETE" },
	);
	expect(removed.status).toBe(204);
	members = await json<Array<{ id: string }>>(
		`/api/workspaces/${workspaceId}/members`,
	);
	expect(members.body).toHaveLength(3);
	// 所有者受保护
	const denied = await fetch(
		`http://localhost/api/members/${members.body[0].id}`,
		{ method: "DELETE" },
	);
	expect(denied.status).toBe(400);
	// 5 人上限：seed 3 人 + 2 个新成员后，第 6 个被拒
	for (let i = 0; i < 3; i++) {
		const result = await json<{ error?: string }>("/api/members", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, name: `M${i}` }),
		});
		if (i < 2) expect(result.response.status).toBe(201);
		else {
			expect(result.response.status).toBe(400);
			expect(result.body.error).toContain("上限");
		}
	}
});

it("rejects invalid access keys on verify/me, accepts authorized keys", async () => {
	const bad = await json<{ ok: boolean }>("/api/auth/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key: "wrong-key" }),
	});
	expect(bad.body.ok).toBe(false);
	const good = await json<{ ok: boolean }>("/api/auth/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key: "kanso-admin" }),
	});
	expect(good.body.ok).toBe(true);
	const me401 = await fetch("http://localhost/api/me", {
		headers: { Authorization: "Bearer wrong-key" },
	});
	expect(me401.status).toBe(401);
});

it("keeps archived tasks intact after same-column reorder", async () => {
	const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
	// 新建空项目，避免 seed 任务干扰列内顺序断言
	const project = await json<{ id: string }>(
		`/api/workspaces/${workspaces.body[0].id}/projects`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "重排测试" }),
		},
	);
	const board = await json<{ columns: Array<{ id: string }> }>(
		`/api/projects/${project.body.id}`,
	);
	const columnId = board.body.columns[0].id;
	const post = (title: string) =>
		json<{ id: string }>(`/api/columns/${columnId}/tasks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		});
	const taskA = await post("A");
	const taskB = await post("B");
	const taskC = await post("C");
	// 归档中间任务 B，再同列重排 C → 位置 0
	await fetch(`http://localhost/api/tasks/${taskB.body.id}/archive`, {
		method: "POST",
	});
	const reordered = await fetch(`http://localhost/api/tasks/${taskC.body.id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ position: 0 }),
	});
	expect(reordered.status).toBe(200);
	// 回归：同列重排曾把归档任务从列数组弄丢
	const archived = await json<Array<{ id: string }>>(
		`/api/projects/${project.body.id}/archived-tasks`,
	);
	expect(archived.body.some((item) => item.id === taskB.body.id)).toBe(true);
	// 未归档任务顺序与 position 正确
	const after = await json<{
		columns: Array<{
			id: string;
			tasks: Array<{ id: string; position: number }>;
		}>;
	}>(`/api/projects/${project.body.id}`);
	const column = after.body.columns.find((c) => c.id === columnId)!;
	expect(column.tasks.map((t) => t.id)).toEqual([taskC.body.id, taskA.body.id]);
	expect(column.tasks.map((t) => t.position)).toEqual([0, 1]);
});

it("reports milestone progress and non-empty completed trend", async () => {
	const workspaces = await json<Array<{ id: string }>>("/api/workspaces");
	const projects = await json<Array<{ id: string }>>(
		`/api/workspaces/${workspaces.body[0].id}/projects`,
	);
	// seed 里程碑 M3 关联了末列任务，应带 progress
	const milestones = await json<
		Array<{ progress?: { done: number; total: number } }>
	>(`/api/projects/${projects.body[0].id}/milestones`);
	expect(milestones.body.some((m) => m.progress && m.progress.total > 0)).toBe(
		true,
	);
	// dashboard 趋势「完成」线不再恒为 0（seed 末列任务带 completedAt；真实后端按 activity 推导，
	// 口径含「移入末列」与「末列直建」，与 seed 场景等价）。
	const dashboard = await json<{ trend: Array<{ completed: number }> }>(
		"/api/dashboard",
	);
	const totalCompleted = dashboard.body.trend.reduce(
		(sum, day) => sum + day.completed,
		0,
	);
	expect(totalCompleted).toBeGreaterThan(0);
});
