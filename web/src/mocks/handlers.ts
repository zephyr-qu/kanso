import { delay, http as mswHttp, HttpResponse } from "msw";
import { mswPattern } from "@/lib/endpoints";
import type { BoardColumn } from "@/types/board";
import type { Label } from "@/types/label";
import type { Member } from "@/types/member";
import type { Task } from "@/types/task";
import type { PinnedProject } from "@/types/pinned-project";
import {
	activities,
	backup,
	board,
	createTask,
	createMember,
	dashboard,
	deleteMember,
	findColumn,
	findLabel,
	findProject,
	findTask,
	getMockDb,
	generateMemberKey,
	revokeMemberKey,
	MEMBER_LIMIT,
	membersForWorkspace,
	memberCanAccessWorkspace,
	me,
	newMockId,
	now,
	persistAnd,
	persistMockDb,
	projectSummaries,
	recordTaskActivity,
	recordScopedActivity,
	search,
	syncTask,
	taskDetail,
} from "./mock-db";

const MOCK_DELAY_MS = Math.max(0, Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 30));
const http: typeof mswHttp = mswHttp;

async function mockDelay(): Promise<void> {
	if (MOCK_DELAY_MS > 0) await delay(MOCK_DELAY_MS);
}

function error(message: string, status: number) {
	return HttpResponse.json({ error: message }, { status });
}

function textParam(value: string | readonly string[] | undefined): string {
	return typeof value === "string" ? value : value?.[0] ?? "";
}

function currentMember(request: Request): Member | undefined {
	const auth = request.headers.get("Authorization") ?? "";
	const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
	const members = getMockDb().members;
	if (!key) return members.find((item) => item.role === "admin");
	const memberId = Object.entries(getMockDb().memberKeys).find(([, value]) => value === key)?.[0];
	return members.find((item) => item.id === memberId);
}

function requireOwner(request: Request): Response | undefined {
	const member = currentMember(request);
	if (!member) return error("访问密钥无效", 401);
	if (member.role !== "admin") return error("只有管理员可以管理成员", 403);
}

function requireWorkspace(request: Request, workspaceId: string): Response | undefined {
	const member = currentMember(request);
	if (!member) return error("访问密钥无效", 401);
	if (!getMockDb().workspaces.some((workspace) => workspace.id === workspaceId)) return error("工作区不存在", 404);
	if (!memberCanAccessWorkspace(member.id, workspaceId)) return error("无权访问当前工作区", 403);
}

function requireProject(request: Request, projectId: string): Response | undefined {
	const project = findProject(projectId);
	if (!project) return error("项目不存在", 404);
	return requireWorkspace(request, project.workspaceId);
}

function activeTasks(column: BoardColumn): Task[] {
	return column.tasks.filter((task) => !task.archivedAt);
}

/** 维持列不变式：未归档任务按数组顺序、position 连续；归档任务恒在列尾。
 *  这样 move 的 position 直接对应数组下标，归档任务也永远不会被重排/丢失。 */
function normalizeColumn(column: BoardColumn): void {
	column.tasks = [...activeTasks(column), ...column.tasks.filter((task) => task.archivedAt)];
	activeTasks(column).forEach((task, index) => { task.position = index; });
}

function findMilestone(milestoneId: string): { projectId: string; index: number } | undefined {
	const db = getMockDb();
	for (const [projectId, milestones] of Object.entries(db.milestones)) {
		const index = milestones.findIndex((milestone) => milestone.id === milestoneId);
		if (index >= 0) return { projectId, index };
	}
}

// 置顶项目（dev mock 会话内内存态；不改写 mock-db 种子）。
let pinnedProjectIds: string[] = [];

export const handlers = [
	http.get(mswPattern("pinnedProjects"), async ({ params, request }) => {
		await mockDelay();
		const all = Object.values(getMockDb().projects).flat();
		const workspaceId = textParam(params.workspaceId);
		const denied = requireWorkspace(request, workspaceId);
		if (denied) return denied;
		const items: PinnedProject[] = all
			.filter((p) => pinnedProjectIds.includes(p.id) && (!workspaceId || p.workspaceId === workspaceId))
			.map((p) => ({ projectId: p.id, workspaceId: p.workspaceId, name: p.name }));
		return HttpResponse.json(items);
	}),

	http.post(mswPattern("setProjectPinned"), async ({ params, request }) => {
		const id = String(params.id);
		const denied = requireProject(request, id);
		if (denied) return denied;
		const body = (await request.json()) as { pinned?: unknown };
		const pinned = Boolean(body.pinned);
		pinnedProjectIds = pinned
			? [...new Set([...pinnedProjectIds, id])]
			: pinnedProjectIds.filter((x) => x !== id);
		const project = findProject(id);
		if (project) recordScopedActivity("project", project.id, project.id, pinned ? "project.pinned" : "project.unpinned", { name: project.name });
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.post(mswPattern("authVerify"), async ({ request }) => {
		await mockDelay();
		// 与后端一致：密钥必须命中已授权成员密钥（memberKeys）才通过。
		const body = await request.json() as { key?: unknown };
		const key = typeof body.key === "string" ? body.key.trim() : "";
		const ok = key.length > 0 && Object.values(getMockDb().memberKeys).includes(key);
		return HttpResponse.json({ ok });
	}),
	http.get(mswPattern("me"), async ({ request }) => {
		await mockDelay();
		const auth = request.headers.get("Authorization") ?? "";
		const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : undefined;
		// 携带了密钥但未命中授权列表 → 401（前端 api() 清除登录态并回登录页）。
		if (key && !Object.values(getMockDb().memberKeys).includes(key)) {
			return HttpResponse.json({ error: "访问密钥无效" }, { status: 401 });
		}
		return HttpResponse.json(me(key));
	}),
	http.get(mswPattern("workspaceMembers"), async ({ params, request }) => {
		await mockDelay();
		const workspaceId = textParam(params.id);
		const denied = requireWorkspace(request, workspaceId);
		if (denied) return denied;
		return HttpResponse.json(membersForWorkspace(workspaceId));
	}),
	http.post(mswPattern("workspaceMembers"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const body = await request.json() as { memberId?: string };
		const memberId = body.memberId ?? "";
		const workspaceId = textParam(params.id);
		const member = getMockDb().members.find((item) => item.id === memberId);
		if (!member) return error("成员不存在", 404);
		const list = getMockDb().workspaceMembers[workspaceId] ?? (getMockDb().workspaceMembers[workspaceId] = []);
		if (!list.includes(memberId)) list.push(memberId);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.delete(mswPattern("workspaceMember"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const workspaceId = textParam(params.id);
		const memberId = textParam(params.memberId);
		const member = getMockDb().members.find((item) => item.id === memberId);
		if (!member) return error("成员不存在", 404);
		if (member.role === "admin") return error("管理员自动拥有全部工作区权限", 403);
		const ids = getMockDb().workspaceMembers[workspaceId] ?? [];
		const index = ids.indexOf(memberId);
		if (index < 0) return error("成员不在当前工作区", 404);
		ids.splice(index, 1);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.patch(mswPattern("member"), async ({ params, request }) => {
		const id = textParam(params.id);
		const current = currentMember(request);
		if (!current) return error("访问密钥无效", 401);
		if (current.role !== "admin" && current.id !== id) return error("当前成员没有执行此操作的权限", 403);
		const body = await request.json() as { name?: string; avatarColor?: string; avatar?: string | null };
		const member = getMockDb().members.find((m) => m.id === id);
		if (member) {
				const previousName = member.name;
				if (body.name?.trim()) member.name = body.name.trim();
				if (body.avatarColor) member.avatarColor = body.avatarColor;
				if (typeof body.avatar === "string") member.avatar = body.avatar;
				else if (body.avatar === null) delete member.avatar;
				if (body.name?.trim() && member.name !== previousName) recordScopedActivity("member", member.id, "", "member.updated", { name: member.name });
				return HttpResponse.json(persistAnd(member));
		}
		return error("成员不存在", 404);
	}),
	http.patch("*/api/members/:id/role", async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const id = textParam(params.id);
		const body = await request.json() as { role?: string };
		const target = getMockDb().members.find((item) => item.id === id);
		if (!target) return error("成员不存在", 404);
		if (body.role !== "admin" && body.role !== "member") return error("角色无效", 400);
		if (target.role === "admin" && body.role === "member" && getMockDb().members.filter((item) => item.role === "admin").length <= 1) {
			return error("至少保留一名管理员", 400);
		}
		if (target.role !== "admin" && body.role === "admin" && getMockDb().members.filter((item) => item.role === "admin").length >= 2) {
			return error("管理员数量最多为 2 名", 400);
		}
		target.role = body.role;
		persistMockDb();
		return HttpResponse.json(target);
	}),
	// 每次调用都轮换访问密钥；旧密钥立即失效。
	http.post(mswPattern("memberKey"), async ({ params, request }) => {
		const actor = currentMember(request);
		const targetId = textParam(params.id);
		if (!actor) return error("访问密钥无效", 401);
		if (actor.role !== "admin" && actor.id !== targetId) return error("只能轮换自己的密钥，或由管理员管理成员密钥", 403);
		const key = generateMemberKey(targetId);
		if (!key) return error("成员不存在", 404);
		await mockDelay();
		return HttpResponse.json({ key });
	}),
	http.delete(mswPattern("memberKey"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const memberId = textParam(params.id);
		const member = getMockDb().members.find((item) => item.id === memberId);
		if (!member) return error("成员不存在", 404);
		if (member.role === "admin") return error("不能撤销管理员密钥，请改为轮换", 400);
		if (!revokeMemberKey(memberId)) return error("撤销成员密钥失败", 500);
		recordScopedActivity("member", memberId, "", "member.key_revoked", { name: member.name });
		return new HttpResponse(null, { status: 204 });
	}),
	// 创建全局成员（实例最多 6 个身份），随后由前端授权当前工作区。
	http.post(mswPattern("members"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const body = await request.json() as { name?: string };
		const name = body.name?.trim() ?? "";
		if (!name) return error("成员名称不能为空", 400);
		if (getMockDb().members.length >= MEMBER_LIMIT) return error("成员和管理员总数已达上限（6 人）", 409);
		const result = createMember(name);
		if (!result.ok) return error(result.error, 400);
		recordScopedActivity("member", result.member.id, "", "member.created", { name: result.member.name });
		return HttpResponse.json(result.member, { status: 201 });
	}),
	// 删除成员：所有者受保护，同时清除其访问密钥。
	http.delete(mswPattern("member"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const memberId = textParam(params.id);
		const member = getMockDb().members.find((item) => item.id === memberId);
		const result = deleteMember(memberId);
		if (!result.ok) return error(result.error, 400);
		if (member) {
			recordScopedActivity("member", member.id, "", "member.deleted", { name: member.name });
			persistMockDb();
		}
		return new HttpResponse(null, { status: 204 });
	}),


	http.get(mswPattern("members"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		return HttpResponse.json(getMockDb().members);
	}),
	http.get(mswPattern("workspaces"), async ({ request }) => {
		await mockDelay();
		const member = currentMember(request);
		if (!member) return error("访问密钥无效", 401);
		const workspaces = member.role === "admin"
			? getMockDb().workspaces
			: getMockDb().workspaces.filter((workspace) => memberCanAccessWorkspace(member.id, workspace.id));
		return HttpResponse.json(workspaces);
	}),
	http.post(mswPattern("workspaces"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const body = await request.json() as { name?: string };
		const workspace = { id: newMockId("workspace"), name: body.name?.trim() || "新工作区", createdAt: now() };
		const db = getMockDb();
		db.workspaces.push(workspace);
		const defaultProject = { id: newMockId("project"), workspaceId: workspace.id, name: "默认项目", position: 0, createdAt: now(), updatedAt: now() };
		db.projects[workspace.id] = [defaultProject];
		db.labels[workspace.id] = [];
		db.workspaceMembers[workspace.id] = [];
		const columnNames = ["待办", "进行中", "已阻塞", "已完成"];
		const columns: BoardColumn[] = columnNames.map((name, position) => ({ id: newMockId("column"), projectId: defaultProject.id, name, position, createdAt: now(), wipLimit: null, tasks: [] }));
		db.boards[defaultProject.id] = { project: defaultProject, columns, labels: [] };
		db.milestones[defaultProject.id] = [];
		recordScopedActivity("workspace", workspace.id, "", "workspace.created", { name: workspace.name }, workspace.name);
		recordScopedActivity("project", defaultProject.id, defaultProject.id, "project.created", { name: defaultProject.name });
		return HttpResponse.json(persistAnd(workspace), { status: 201 });
	}),
	http.patch(mswPattern("workspace"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const workspace = getMockDb().workspaces.find((item) => item.id === textParam(params.id));
		if (!workspace) return error("工作区不存在", 404);
		const body = await request.json() as { name?: string };
		if (body.name?.trim()) workspace.name = body.name.trim();
		if (body.name?.trim()) recordScopedActivity("workspace", workspace.id, "", "workspace.updated", { name: workspace.name }, workspace.name);
		return HttpResponse.json(persistAnd(workspace));
	}),
	http.delete(mswPattern("workspace"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const workspaceId = textParam(params.id);
		const db = getMockDb();
		const workspace = db.workspaces.find((item) => item.id === workspaceId);
		if (!workspace) return error("工作区不存在", 404);
		for (const project of db.projects[workspaceId] ?? []) {
			for (const task of db.boards[project.id]?.columns.flatMap((column) => column.tasks) ?? []) delete db.details[task.id];
			delete db.boards[project.id];
			delete db.milestones[project.id];
			db.activities = db.activities.filter((activity) => activity.projectId !== project.id);
			delete db.labels[project.id];
		}
		db.workspaces = db.workspaces.filter((item) => item.id !== workspaceId);
		delete db.projects[workspaceId];
		recordScopedActivity("workspace", workspaceId, "", "workspace.deleted", { name: workspace.name }, workspace.name);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(mswPattern("workspaceProjects"), async ({ params, request }) => {
		await mockDelay();
		const denied = requireWorkspace(request, textParam(params.workspaceId));
		if (denied) return denied;
		return HttpResponse.json(projectSummaries(textParam(params.workspaceId)));
	}),
	http.post(mswPattern("workspaceProjects"), async ({ params, request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		const workspaceId = textParam(params.workspaceId);
		if (!getMockDb().workspaces.some((item) => item.id === workspaceId)) return error("工作区不存在", 404);
		const body = await request.json() as { name?: string };
		const projects = getMockDb().projects[workspaceId] ??= [];
		const project = { id: newMockId("project"), workspaceId, name: body.name?.trim() || "新项目", position: projects.length, createdAt: now(), updatedAt: now() };
		projects.push(project);
		// 0008：模板已移除，固定种子看板默认列。
		const columnNames = ["待办", "进行中", "已阻塞", "已完成"];
		const columns: BoardColumn[] = columnNames.map((name, position) => ({ id: newMockId("column"), projectId: project.id, name, position, createdAt: now(), wipLimit: null, tasks: [] }));
		getMockDb().boards[project.id] = { project, columns, labels: getMockDb().labels[project.id] ?? [] };
		getMockDb().milestones[project.id] = [];
		recordScopedActivity("project", project.id, project.id, "project.created", { name: project.name });
		return HttpResponse.json(persistAnd(project), { status: 201 });
	}),
	http.patch(mswPattern("project"), async ({ params, request }) => {
		const projectId = textParam(params.id);
		const denied = requireOwner(request) ?? requireProject(request, projectId);
		if (denied) return denied;
		const project = findProject(projectId)!;
		const body = await request.json() as { name?: string };
		if (body.name?.trim()) project.name = body.name.trim();
		project.updatedAt = now();
		const currentBoard = getMockDb().boards[project.id];
		if (currentBoard) currentBoard.project = project;
		for (const detail of Object.values(getMockDb().details)) if (detail.task.projectId === project.id) detail.projectName = project.name;
		if (body.name?.trim()) recordScopedActivity("project", project.id, project.id, "project.updated", { name: project.name });
		return HttpResponse.json(persistAnd(project));
	}),
	http.delete(mswPattern("project"), async ({ params, request }) => {
		const projectId = textParam(params.id);
		const denied = requireOwner(request) ?? requireProject(request, projectId);
		if (denied) return denied;
		const project = findProject(projectId)!;
		const db = getMockDb();
		db.projects[project.workspaceId] = (db.projects[project.workspaceId] ?? []).filter((item) => item.id !== projectId);
		delete db.boards[projectId];
		delete db.milestones[projectId];
		for (const taskId of Object.keys(db.details)) if (db.details[taskId].task.projectId === projectId) delete db.details[taskId];
		db.activities = db.activities.filter((activity) => activity.projectId !== projectId);
		delete db.labels[projectId];
		recordScopedActivity("project", projectId, projectId, "project.deleted", { name: project.name }, project.name);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.get(mswPattern("project"), async ({ params, request }) => {
		await mockDelay();
		const denied = requireProject(request, textParam(params.id));
		if (denied) return denied;
		const value = board(textParam(params.id));
		if (!value) return error("项目不存在", 404);
		return HttpResponse.json({ ...value, columns: value.columns.map((column) => ({ ...column, tasks: activeTasks(column) })) });
	}),

	http.get(mswPattern("dashboard"), async ({ params, request }) => { await mockDelay(); const denied = requireWorkspace(request, textParam(params.workspaceId)); if (denied) return denied; return HttpResponse.json(dashboard(textParam(params.workspaceId))); }),
	http.get(mswPattern("activity"), async ({ params, request }) => { await mockDelay(); const denied = requireWorkspace(request, textParam(params.workspaceId)); if (denied) return denied; return HttpResponse.json(activities(textParam(params.workspaceId))); }),
	http.get(mswPattern("calendar"), async ({ params, request }) => {
		await mockDelay();
		const workspaceId = textParam(params.workspaceId);
		const denied = requireWorkspace(request, workspaceId);
		if (denied) return denied;
		const tasks = Object.values(getMockDb().boards)
			.filter((item) => !workspaceId || item.project.workspaceId === workspaceId)
			.flatMap((item) => item.columns.flatMap((column) => column.tasks.filter((task) => !task.archivedAt && task.dueDate).map((task) => ({ ...task, projectName: item.project.name, workspaceId: item.project.workspaceId }))));
		return HttpResponse.json({ tasks });
	}),
	http.get(mswPattern("search"), async ({ request, params }) => { await mockDelay(); const denied = requireWorkspace(request, textParam(params.workspaceId)); if (denied) return denied; return HttpResponse.json(search(new URL(request.url).searchParams.get("q") ?? "", textParam(params.workspaceId))); }),
	http.get(mswPattern("settingsBackup"), async ({ request }) => { const denied = requireOwner(request); if (denied) return denied; await mockDelay(); return HttpResponse.json(backup()); }),
	http.post(mswPattern("settingsBackup"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		await mockDelay();
		const body = await request.json().catch(() => null);
		if (!body || typeof body !== "object" || !("workspaces" in body)) {
			return HttpResponse.json({ error: "备份文件格式无效" }, { status: 400 });
		}
		return HttpResponse.json({ ok: true });
	}),

	http.get(mswPattern("settingsConfig"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		await mockDelay();
		return HttpResponse.json({
			addr: ":8080",
			dataDir: "./data",
			mode: "personal",
			wsOrigins: "",
			autoArchiveEnabled: true,
			autoArchiveAfterDays: 7,
			configFile: "kanso-config.json",
		});
	}),
	http.put(mswPattern("settingsConfig"), async ({ request }) => {
		const denied = requireOwner(request);
		if (denied) return denied;
		await mockDelay();
		return HttpResponse.json({ ok: true, configFile: "kanso-config.json" });
	}),
	http.get(mswPattern("health"), async () => {
		await mockDelay();
		return HttpResponse.json({ ok: true, name: "kanso", version: "mock", mode: "personal" });
	}),

	http.post(mswPattern("projectColumns"), async ({ params, request }) => {
		const projectId = textParam(params.projectId);
		const currentBoard = getMockDb().boards[projectId];
		if (!currentBoard) return error("项目不存在", 404);
		const body = await request.json() as { name?: string; wipLimit?: number | null };
		const column: BoardColumn = { id: newMockId("column"), projectId, name: body.name?.trim() || "新列", position: currentBoard.columns.length, createdAt: now(), wipLimit: body.wipLimit ?? null, tasks: [] };
		currentBoard.columns.push(column);
		recordScopedActivity("column", column.id, projectId, "column.created", { name: column.name });
		return HttpResponse.json(persistAnd({ ...column, tasks: undefined }), { status: 201 });
	}),
	http.patch(mswPattern("column"), async ({ params, request }) => {
		const hit = findColumn(textParam(params.id));
		if (!hit) return error("列不存在", 404);
		const body = await request.json() as { name?: string; position?: number; wipLimit?: number | null };
		if (body.name?.trim()) hit.column.name = body.name.trim();
		if ("wipLimit" in body) hit.column.wipLimit = body.wipLimit ?? null;
		if (typeof body.position === "number") {
			const from = hit.board.columns.findIndex((column) => column.id === hit.column.id);
			hit.board.columns.splice(from, 1);
			hit.board.columns.splice(Math.min(Math.max(body.position, 0), hit.board.columns.length), 0, hit.column);
			hit.board.columns.forEach((column, index) => { column.position = index; });
		}
		recordScopedActivity("column", hit.column.id, hit.board.project.id, typeof body.position === "number" ? "column.moved" : "column.updated", { name: hit.column.name, ...(typeof body.position !== "number" ? { wipLimit: hit.column.wipLimit } : {}) });
		persistMockDb();
		return HttpResponse.json({ ...hit.column, tasks: undefined });
	}),
	http.delete(mswPattern("column"), async ({ params }) => {
		const hit = findColumn(textParam(params.id));
		if (!hit) return error("列不存在", 404);
		const db = getMockDb();
		for (const task of hit.column.tasks) delete db.details[task.id];
		recordScopedActivity("column", hit.column.id, hit.board.project.id, "column.deleted", { name: hit.column.name });
		hit.board.columns = hit.board.columns.filter((column) => column.id !== hit.column.id);
		hit.board.columns.forEach((column, index) => { column.position = index; });
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),

	http.post(mswPattern("columnTasks"), async ({ params, request }) => {
		const hit = findColumn(textParam(params.columnId));
		if (!hit) return error("列不存在", 404);
		const body = await request.json() as Partial<Task>;
		return HttpResponse.json(persistAnd(createTask(hit.column, body)), { status: 201 });
	}),
	http.patch(mswPattern("task"), async ({ params, request }) => {
		const found = findTask(textParam(params.id));
		if (!found) return error("任务不存在", 404);
		const body = await request.json() as Partial<Task>;
		const task = found.task;
		const moved = typeof body.columnId === "string" || typeof body.position === "number";
		if (typeof body.columnId === "string" && body.columnId !== found.column.id) {
			const target = findColumn(body.columnId);
			if (!target || target.board.project.id !== task.projectId) return error("目标列不存在", 400);
			found.column.tasks.splice(found.index, 1);
			const position = Math.min(Math.max(body.position ?? activeTasks(target.column).length, 0), activeTasks(target.column).length);
			task.columnId = target.column.id;
			target.column.tasks.splice(position, 0, task);
			normalizeColumn(found.column); normalizeColumn(target.column);
		} else if (typeof body.position === "number") {
			// 只重排未归档任务；归档任务先取出、重排后放回列尾（normalizeColumn 维持不变式，不会丢）。
			const others = activeTasks(found.column).filter((item) => item.id !== task.id);
			const archived = found.column.tasks.filter((item) => item.archivedAt);
			const position = Math.min(Math.max(body.position, 0), others.length);
			found.column.tasks = [...others.slice(0, position), task, ...others.slice(position), ...archived];
			normalizeColumn(found.column);
		}
		if (typeof body.title === "string") task.title = body.title;
		if ("description" in body) task.description = body.description ?? null;
		if ("priority" in body) task.priority = body.priority ?? null;
		if ("dueDate" in body) task.dueDate = body.dueDate || null;
		task.updatedAt = now();
		if (moved) {
			// 完成标记：进入项目末列视为完成（口径与 dashboard 一致），离开则清除。
			const currentBoard = getMockDb().boards[task.projectId];
			const lastColumnId = [...(currentBoard?.columns ?? [])].sort((a, b) => a.position - b.position).at(-1)?.id;
			task.completedAt = lastColumnId && task.columnId === lastColumnId ? now() : null;
		}
		syncTask(task);
		recordTaskActivity(
			task,
			moved ? "task.moved" : "task.updated",
			moved
				? {
						// 对齐后端 { from, to }（列 ID）；mock 额外带列名供活动流展示。
						from: found.column.id,
						to: task.columnId,
						fromName: found.column.name,
						toName: getMockDb().boards[task.projectId]?.columns.find((column) => column.id === task.columnId)?.name,
					}
				: { title: task.title },
		);
		persistMockDb();
		return HttpResponse.json(task);
	}),
	http.delete(mswPattern("task"), async ({ params }) => {
		const found = findTask(textParam(params.id));
		if (!found) return error("任务不存在", 404);
		const db = getMockDb();
		found.column.tasks.splice(found.index, 1);
		delete db.details[found.task.id];
		db.activities = db.activities.filter((activity) => activity.resourceId !== found.task.id);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.post(mswPattern("taskArchive"), async ({ params }) => archiveTask(textParam(params.id), true)),
	http.post(mswPattern("taskRestore"), async ({ params }) => archiveTask(textParam(params.id), false)),
	http.get(mswPattern("projectArchivedTasks"), async ({ params }) => {
		const currentBoard = getMockDb().boards[textParam(params.id)];
		if (!currentBoard) return error("项目不存在", 404);
		return HttpResponse.json(currentBoard.columns.flatMap((column) => column.tasks.filter((task) => task.archivedAt)));
	}),

	http.get(mswPattern("task"), async ({ params }) => {
		await mockDelay();
		const detail = taskDetail(textParam(params.id));
		if (!detail) return error("任务不存在", 404);
		return HttpResponse.json(detail);
	}),
	http.post(mswPattern("taskComments"), async ({ params, request }) => {
		const taskId = textParam(params.id);
		const detail = getMockDb().details[taskId];
		if (!detail) return error("任务不存在", 404);
		const body = await request.json() as { content?: string };
		if (!body.content?.trim()) return error("评论内容不能为空", 400);
		const comment = { id: newMockId("comment"), taskId, author: "Admin", content: body.content.trim(), createdAt: now() };
		detail.comments.push(comment);
		const activity = { id: newMockId("activity"), resourceType: "task", resourceId: taskId, action: "comment.created", actor: "Admin", projectName: detail.projectName, data: JSON.stringify({ content: comment.content }), createdAt: comment.createdAt };
		detail.activity.unshift(activity);
		getMockDb().activities.unshift({ ...activity, projectId: detail.task.projectId });
		persistMockDb();
		return HttpResponse.json(comment, { status: 201 });
	}),
	http.patch(mswPattern("comment"), async ({ params, request }) => {
		const commentId = textParam(params.id);
		const body = await request.json() as { content?: unknown };
		const content = typeof body.content === "string" ? body.content.trim() : "";
		if (!content) return error("评论内容不能为空", 400);
		for (const detail of Object.values(getMockDb().details)) {
			const comment = detail.comments.find((item) => item.id === commentId);
			if (!comment) continue;
			comment.content = content;
			const activity = { id: newMockId("activity"), resourceType: "task", resourceId: detail.task.id, action: "comment.updated", actor: "Admin", projectName: detail.projectName, data: JSON.stringify({ content }), createdAt: now() };
			getMockDb().activities.unshift({ ...activity, projectId: detail.task.projectId });
			persistMockDb();
			return HttpResponse.json(comment);
		}
		return error("评论不存在", 404);
	}),
	http.delete(mswPattern("comment"), async ({ params }) => {
		const commentId = textParam(params.id);
		for (const detail of Object.values(getMockDb().details)) {
			const index = detail.comments.findIndex((comment) => comment.id === commentId);
			if (index >= 0) {
				const task = detail.task;
				const activity = { id: newMockId("activity"), resourceType: "task", resourceId: task.id, action: "comment.deleted", actor: "Admin", projectName: detail.projectName, data: JSON.stringify({ content: detail.comments[index].content }), createdAt: now() };
				detail.comments.splice(index, 1);
				detail.activity.unshift(activity);
				getMockDb().activities.unshift({ ...activity, projectId: task.projectId });
				persistMockDb();
				return new HttpResponse(null, { status: 204 });
			}
		}
		return error("评论不存在", 404);
	}),

	http.post(mswPattern("projectLabels"), async ({ params, request }) => {
		const projectId = textParam(params.projectId);
		if (!getMockDb().boards[projectId]) return error("项目不存在", 404);
		const body = await request.json() as { name?: string };
		const label: Label = { id: newMockId("label"), projectId, name: body.name?.trim() || "新标签", createdAt: now() };
		const projectLabels = (getMockDb().labels[projectId] ??= []);
		projectLabels.push(label);
		if (getMockDb().boards[projectId]) getMockDb().boards[projectId].labels = projectLabels;
		recordScopedActivity("label", label.id, projectId, "label.created", { name: label.name });
		return HttpResponse.json(persistAnd(label), { status: 201 });
	}),
	http.patch(mswPattern("label"), async ({ params, request }) => {
		const found = findLabel(textParam(params.id));
		if (!found) return error("标签不存在", 404);
		const body = await request.json() as { name?: string };
		if (body.name?.trim()) found.label.name = body.name.trim();
		for (const task of Object.values(getMockDb().boards).flatMap((item) => item.columns.flatMap((column) => column.tasks))) task.labels = task.labels?.map((label) => label.id === found.label.id ? found.label : label);
		recordScopedActivity("label", found.label.id, found.label.projectId, "label.updated", { name: found.label.name });
		return HttpResponse.json(persistAnd(found.label));
	}),
	http.delete(mswPattern("label"), async ({ params }) => {
		const found = findLabel(textParam(params.id));
		if (!found) return error("标签不存在", 404);
		recordScopedActivity("label", found.label.id, found.label.projectId, "label.deleted", { name: found.label.name });
		found.list.splice(found.list.indexOf(found.label), 1);
		for (const board of Object.values(getMockDb().boards)) { board.labels = board.labels.filter((label) => label.id !== found.label.id); for (const task of board.columns.flatMap((column) => column.tasks)) { task.labels = task.labels?.filter((label) => label.id !== found.label.id); syncTask(task); } }
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.post(mswPattern("taskLabels"), async ({ params }) => toggleLabel(textParam(params.taskId), textParam(params.labelId), true)),
	http.delete(mswPattern("taskLabels"), async ({ params }) => toggleLabel(textParam(params.taskId), textParam(params.labelId), false)),

	http.get(mswPattern("projectMilestones"), async ({ params }) => {
		const projectId = textParam(params.id);
		const db = getMockDb();
		const currentBoard = db.boards[projectId];
		if (!currentBoard) return error("项目不存在", 404);
		// 进度聚合：关联任务中位于项目末列（已完成）的比例。
		const lastColumnId = [...currentBoard.columns].sort((a, b) => a.position - b.position).at(-1)?.id ?? "";
		return HttpResponse.json((db.milestones[projectId] ?? []).map((milestone) => {
			const linked = currentBoard.columns.flatMap((column) => column.tasks).filter((task) => (db.taskMilestones[task.id] ?? []).includes(milestone.id));
			return { ...milestone, progress: { done: linked.filter((task) => !task.archivedAt && task.columnId === lastColumnId).length, total: linked.length } };
		}));
	}),
	http.post(mswPattern("projectMilestones"), async ({ params, request }) => {
		const projectId = textParam(params.id);
		if (!getMockDb().boards[projectId]) return error("项目不存在", 404);
		const body = await request.json() as { name?: string; dueDate?: string | null };
		const milestone = { id: newMockId("milestone"), projectId, name: body.name?.trim() || "新里程碑", dueDate: body.dueDate ?? null, createdAt: now() };
		(getMockDb().milestones[projectId] ??= []).push(milestone);
		recordScopedActivity("milestone", milestone.id, projectId, "milestone.created", { name: milestone.name });
		return HttpResponse.json(persistAnd(milestone), { status: 201 });
	}),
	http.patch(mswPattern("milestone"), async ({ params, request }) => {
		const hit = findMilestone(textParam(params.id));
		if (!hit) return error("里程碑不存在", 404);
		const milestone = getMockDb().milestones[hit.projectId][hit.index];
		const body = await request.json() as { name?: string; dueDate?: string | null };
		if (body.name?.trim()) milestone.name = body.name.trim();
		if ("dueDate" in body) milestone.dueDate = body.dueDate ?? null;
		recordScopedActivity("milestone", milestone.id, milestone.projectId, "milestone.updated", { name: milestone.name });
		return HttpResponse.json(persistAnd(milestone));
	}),
	http.delete(mswPattern("milestone"), async ({ params }) => {
		const hit = findMilestone(textParam(params.id));
		if (!hit) return error("里程碑不存在", 404);
		const milestone = getMockDb().milestones[hit.projectId][hit.index];
		recordScopedActivity("milestone", milestone.id, milestone.projectId, "milestone.deleted", { name: milestone.name });
		getMockDb().milestones[hit.projectId].splice(hit.index, 1);
		persistMockDb();
		return new HttpResponse(null, { status: 204 });
	}),
	http.post(mswPattern("taskMilestones"), async ({ params }) => milestoneLink(textParam(params.taskId), textParam(params.milestoneId), true)),
	http.delete(mswPattern("taskMilestones"), async ({ params }) => milestoneLink(textParam(params.taskId), textParam(params.milestoneId), false)),
	http.get(mswPattern("milestoneTasks"), async ({ params }) => {
		const milestoneId = textParam(params.id);
		const db = getMockDb();
		if (!findMilestone(milestoneId)) return error("里程碑不存在", 404);
		// 反查关联该里程碑的任务。
		const tasks: Array<{ id: string; title: string; columnName: string; archived: boolean }> = [];
		for (const board of Object.values(db.boards)) {
			for (const col of board.columns) {
				for (const t of col.tasks) {
					if ((db.taskMilestones[t.id] ?? []).includes(milestoneId)) {
						tasks.push({ id: t.id, title: t.title, columnName: col.name, archived: !!t.archivedAt });
					}
				}
			}
		}
		return HttpResponse.json(tasks);
	}),
];

async function archiveTask(taskId: string, archived: boolean) {
	const found = findTask(taskId);
	if (!found) return error("任务不存在", 404);
	found.task.archivedAt = archived ? now() : null;
	found.task.updatedAt = now();
	normalizeColumn(found.column); // 归档/恢复后维持「归档在列尾」不变式（移动的 position 语义不被打乱）。
	syncTask(found.task);
	recordTaskActivity(found.task, archived ? "task.archived" : "task.restored", { archivedAt: found.task.archivedAt, title: found.task.title });
	persistMockDb();
	return HttpResponse.json(found.task);
}

async function toggleLabel(taskId: string, labelId: string, attach: boolean) {
	const found = findTask(taskId);
	const label = findLabel(labelId)?.label;
	if (!found || !label) return error("任务或标签不存在", 404);
	found.task.labels = attach ? [...(found.task.labels ?? []).filter((item) => item.id !== label.id), label] : (found.task.labels ?? []).filter((item) => item.id !== label.id);
	syncTask(found.task);
	recordTaskActivity(found.task, attach ? "label.attached" : "label.detached", { label: label.name });
	persistMockDb();
	return new HttpResponse(null, { status: 204 });
}

async function milestoneLink(taskId: string, milestoneId: string, attach: boolean) {
	const task = findTask(taskId);
	const milestone = findMilestone(milestoneId);
	if (!task || !milestone) return error("任务或里程碑不存在", 404);
	if (task.task.projectId !== milestone.projectId) return error("任务与里程碑不属于同一项目", 400);
	const links = getMockDb().taskMilestones[taskId] ??= [];
	if (attach && !links.includes(milestoneId)) links.push(milestoneId);
	if (!attach) getMockDb().taskMilestones[taskId] = links.filter((id) => id !== milestoneId);
	// 里程碑关联也记活动（此前漏记），带名称供活动流展示。
	const milestoneName = getMockDb().milestones[milestone.projectId]?.[milestone.index]?.name;
	recordTaskActivity(task.task, attach ? "milestone.attached" : "milestone.detached", { milestoneId, milestoneName });
	persistMockDb();
	return new HttpResponse(null, { status: 204 });
}
