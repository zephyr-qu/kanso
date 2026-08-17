import type { Board, BoardColumn, Column, Milestone } from "@/types/board";
import type { DashboardData } from "@/lib/dashboard";
import type { Label } from "@/types/label";
import type { Member } from "@/types/member";
import type { Project } from "@/types/project";
import type { Comment, Activity, TaskDetail } from "@/types/task-detail";
import type { Task } from "@/types/task";
import type { SearchHit } from "@/types/search";
import type { Workspace } from "@/types/workspace";
import type { ActivityDataByAction } from "@/lib/events";

// v6：活动 data 改为结构化详情（列名/评论内容/里程碑名），旧数据不兼容，强制重新 seed。
export const MOCK_STORAGE_KEY = "kanso-mock-db-v6";

type MockActivity = Activity & { projectId: string };

export type MockDb = {
	workspaces: Workspace[];
	projects: Record<string, Project[]>;
	boards: Record<string, Board>;
	details: Record<string, TaskDetail>;
	labels: Record<string, Label[]>;
	members: Record<string, Member[]>;
	memberKeys: Record<string, string>;
	milestones: Record<string, Milestone[]>;
	taskMilestones: Record<string, string[]>;
	activities: MockActivity[];
};

const iso = (daysAgo = 0): string =>
	new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const dateOffset = (daysFromToday: number): string =>
	new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);

const id = (prefix: string): string =>
	`${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

function seedDb(): MockDb {
	const workspace: Workspace = {
		id: "6f17e7c8629b5d8e91669bb3cb333aa6",
		name: "个人工作区",
		createdAt: iso(12),
	};
	// 轻量成员（1-3 人）：当前登录身份固定为 owner（Ad）。
	const members: Member[] = [
		{ id: "mock-member-1", workspaceId: workspace.id, name: "Ad", role: "owner" },
		{
			id: "mock-member-2",
			workspaceId: workspace.id,
			name: "Kim",
			role: "member",
		},
		{
			id: "mock-member-3",
			workspaceId: workspace.id,
			name: "Jay",
			role: "member",
		},
	];
	// 成员访问密钥：owner 持有后台密钥，其他成员由管理员分配（初始为空）。
	const memberKeys: Record<string, string> = { [members[0].id]: "kanso-admin" };
	const projects: Project[] = [
		{
			id: "mock-project",
			workspaceId: workspace.id,
			name: "Kanso 看板工具",
			position: 0,
			createdAt: iso(10),
			updatedAt: iso(0),
		},
		{
			id: "mock-project-blog",
			workspaceId: workspace.id,
			name: "个人博客迁移",
			position: 1,
			createdAt: iso(9),
			updatedAt: iso(2),
		},
		{
			id: "mock-project-home",
			workspaceId: workspace.id,
			name: "家庭事务清单",
			position: 2,
			createdAt: iso(8),
			updatedAt: iso(3),
		},
		{
			id: "mock-project-reading",
			workspaceId: workspace.id,
			name: "读书笔记",
			position: 3,
			createdAt: iso(7),
			updatedAt: iso(5),
		},
	];
	// 每个项目一套标签（项目维度，项目间互不影响）。
	const labelNames = ["前端", "设计", "后端", "文档", "运维"];
	const labelsByProject: Record<string, Label[]> = {};
	for (const project of projects) {
		labelsByProject[project.id] = labelNames.map((name, index) => ({
			id: `mock-label-${project.id}-${index}`,
			projectId: project.id,
			name,
			createdAt: iso(9 - index),
		}));
	}
	const details: Record<string, TaskDetail> = {};
	const activities: MockActivity[] = [];
	const boards: Record<string, Board> = {};
	const projectTasks: Record<
		string,
		Array<{
			title: string;
			description?: string | null;
			priority: string;
			due?: number;
			age: number;
			labels?: string[];
			comments?: string[];
		}>
	> = {
		["mock-project"]: [
			{
				title: "全局搜索支持模糊匹配",
				priority: "urgent",
				due: 1,
				age: 1,
				labels: ["后端", "前端"],
				comments: ["搜索结果需要覆盖标题和描述。"],
			},
			{
				title: "日历视图拖拽改期",
				priority: "high",
				due: 3,
				age: 8,
				labels: ["前端"],
			},
			{ title: "里程碑进度组件", priority: "med", age: 9, labels: ["后端"] },
			{
				title: "归档任务取消归档恢复",
				priority: "low",
				age: 10,
				labels: ["运维"],
			},
			{
				title: "泳道按标签横向分组",
				description: "看板可以按标签拆成横向泳道，保留原有拖拽语义。",
				priority: "urgent",
				due: 0,
				age: 0,
				labels: ["前端", "设计"],
				comments: ["泳道数据先由 Mock 固化。"],
			},
			{
				title: "Quick Capture 全局快捷键",
				priority: "high",
				due: 2,
				age: 2,
				labels: ["前端"],
			},
			{ title: "WIP 超限软警告", priority: "med", age: 4, labels: ["后端"] },
			{
				title: "周期时间从 activity 推导",
				priority: "high",
				due: -1,
				age: 8,
				labels: ["后端", "文档"],
				comments: ["先按 activity 计算进入和离开列的时间。"],
			},
			{ title: "CSV 导出", priority: "low", age: 10, labels: ["文档"] },
			{
				title: "M3 保存视图（浏览器本地）",
				priority: "low",
				age: 12,
				labels: ["前端"],
			},
		],
		["mock-project-blog"]: [
			{ title: "读 React 源码的收获", priority: "med", age: 2 },
			{ title: "首页信息架构重排", priority: "high", age: 9 },
			{ title: "迁移旧文章图片", priority: "urgent", due: 2, age: 11 },
			{ title: "接入 RSS 输出", priority: "low", age: 8 },
			{ title: "整理发布流程", priority: "med", age: 10 },
		],
		["mock-project-home"]: [
			{ title: "续交宽带费用", priority: "urgent", due: 0, age: 1 },
			{ title: "预约车辆年检", priority: "med", due: 12, age: 7 },
			{ title: "整理家庭事务清单", priority: "low", age: 9 },
			{ title: "购买空气净化器滤芯", priority: "high", age: 11 },
		],
		["mock-project-reading"]: [
			{ title: "《禅与摩托车维修艺术》", priority: "low", age: 13 },
			{ title: "《设计心理学》摘录", priority: "med", age: 14 },
			{ title: "《置身事内》读书卡片", priority: "low", age: 15 },
		],
	};
	for (const [projectId, definitions] of Object.entries(projectTasks)) {
		const project = projects.find((item) => item.id === projectId)!;
		const projectLabels = labelsByProject[projectId];
		const columnDefs = ["待办", "进行中", "已阻塞", "已完成"];
		const columns: BoardColumn[] = columnDefs.map((name, position) => ({
			id: `${projectId}-column-${position}`,
			projectId,
			name,
			position,
			createdAt: project.createdAt,
			wipLimit: position === 1 && projectId === "mock-project" ? 3 : null,
			tasks: [],
		}));
		const todoCount =
			projectId === "mock-project"
				? 4
				: projectId === "mock-project-blog"
					? 3
					: projectId === "mock-project-home"
						? 2
						: 1;
		const doingCount = projectId === "mock-project" ? 3 : 1;
		const blockedCount = projectId === "mock-project" ? 2 : 0;
		definitions.forEach((definition, index) => {
			const column =
				columns[
					index < todoCount
						? 0
						: index < todoCount + doingCount
							? 1
							: index < todoCount + doingCount + blockedCount
								? 2
								: 3
				];
			const task: Task = {
				id: `${projectId}-task-${index}`,
				projectId,
				columnId: column.id,
				title: definition.title,
				description: definition.description ?? null,
				position: column.tasks.length,
				createdAt: iso(definition.age),
				updatedAt: iso(Math.max(0, definition.age - 1)),
				priority: definition.priority,
				dueDate: definition.due == null ? null : dateOffset(definition.due),
				labels: (definition.labels ?? [])
					.map((name) => projectLabels.find((label) => label.name === name)!)
					.filter(Boolean),
				completedAt:
					column === columns[columns.length - 1]
						? iso(Math.max(0, definition.age - 1))
						: null,
			};
			column.tasks.push(task);
			const comments: Comment[] = (definition.comments ?? []).map(
				(content, commentIndex) => ({
					id: `${task.id}-comment-${commentIndex}`,
					taskId: task.id,
					author: "Admin",
					content,
					createdAt: iso(Math.max(0, definition.age - 1)),
				}),
			);
			const activity: Activity = {
				id: id("activity"),
				resourceType: "task",
				resourceId: task.id,
				action: "task.created",
				actor: "Admin",
				projectName: project.name,
				data: activityData("task.created", { title: task.title }),
				createdAt: task.createdAt,
			};
			details[task.id] = {
				task,
				projectName: project.name,
				columnName: column.name,
				labels: task.labels ?? [],
				comments,
				activity: [activity],
			};
			activities.push({ ...activity, projectId });
		});
		boards[projectId] = { project, columns, labels: projectLabels };
	}
	const mainActivities: MockActivity[] = [
		{
			id: id("activity"),
			resourceType: "task",
			resourceId: `${projects[0].id}-task-0`,
			action: "task.moved",
			actor: "Admin",
			projectName: projects[0].name,
			data: activityData("task.moved", {
				from: "mock-project-column-0",
				to: "mock-project-column-1",
				fromName: "待办",
				toName: "进行中",
			}),
			createdAt: iso(0),
			projectId: projects[0].id,
		},
		{
			id: id("activity"),
			resourceType: "task",
			resourceId: `${projects[1].id}-task-0`,
			action: "task.created",
			actor: "Admin",
			projectName: projects[1].name,
			data: activityData("task.created", { title: "读 React 源码的收获" }),
			createdAt: iso(0),
			projectId: projects[1].id,
		},
		{
			id: id("activity"),
			resourceType: "task",
			resourceId: `${projects[0].id}-task-4`,
			action: "comment.created",
			actor: "Admin",
			projectName: projects[0].name,
			data: activityData("comment.created", {
				content: "搜索结果需要覆盖标题和描述。",
			}),
			createdAt: iso(1),
			projectId: projects[0].id,
		},
		{
			id: id("activity"),
			resourceType: "task",
			resourceId: `${projects[2].id}-task-0`,
			action: "task.updated",
			actor: "Admin",
			projectName: projects[2].name,
			data: activityData("task.updated", { title: "续交宽带费用" }),
			createdAt: iso(3),
			projectId: projects[2].id,
		},
	];
	activities.unshift(...mainActivities);
	return {
		workspaces: [workspace],
		projects: { [workspace.id]: projects },
		boards,
		details,
		labels: labelsByProject,
		members: { [workspace.id]: members },
		memberKeys,
		milestones: {
			[projects[0].id]: [
				{
					id: "mock-milestone-m3",
					projectId: projects[0].id,
					name: "M3 保存视图",
					dueDate: dateOffset(14),
					createdAt: iso(2),
				},
			],
		},
		taskMilestones: { [`${projects[0].id}-task-9`]: ["mock-milestone-m3"] },
		activities,
	};
}

let db: MockDb = seedDb();

function clone<T>(value: T): T {
	return structuredClone(value);
}

export function resetMockDb(): void {
	db = seedDb();
	try {
		localStorage.removeItem(MOCK_STORAGE_KEY);
	} catch {
		/* test/runtime without storage */
	}
}

export function loadMockDb(): void {
	try {
		const raw = localStorage.getItem(MOCK_STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw) as MockDb;
		if (
			parsed?.workspaces &&
			parsed.projects &&
			parsed.boards &&
			parsed.details &&
			parsed.labels &&
			parsed.members &&
			parsed.memberKeys &&
			parsed.milestones &&
			parsed.taskMilestones &&
			parsed.activities
		) {
			db = parsed;
			// v5 迁移：早期种子的「阻塞中」列统一改名为规范名「已阻塞」（项目模板口径）。
			for (const board of Object.values(db.boards)) {
				for (const column of board.columns) {
					if (column.name === "阻塞中") column.name = "已阻塞";
				}
			}
		}
	} catch {
		/* corrupted storage falls back to the seed */
	}
}

export function persistMockDb(): void {
	try {
		localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
	} catch {
		/* private mode/quota: keep memory state */
	}
}

export function getMockDb(): MockDb {
	return db;
}
export function newMockId(prefix: string): string {
	return id(prefix);
}
export function now(): string {
	return new Date().toISOString();
}

export function findProject(projectId: string): Project | undefined {
	return Object.values(db.projects)
		.flat()
		.find((project) => project.id === projectId);
}

export function findColumn(
	columnId: string,
): { board: Board; column: BoardColumn } | undefined {
	for (const board of Object.values(db.boards)) {
		const column = board.columns.find((item) => item.id === columnId);
		if (column) return { board, column };
	}
}

export function findTask(
	taskId: string,
):
	| { board: Board; column: BoardColumn; task: Task; index: number }
	| undefined {
	for (const board of Object.values(db.boards)) {
		for (const column of board.columns) {
			const index = column.tasks.findIndex((task) => task.id === taskId);
			if (index >= 0) return { board, column, task: column.tasks[index], index };
		}
	}
}

export function findLabel(
	labelId: string,
): { list: Label[]; label: Label } | undefined {
	for (const list of Object.values(db.labels)) {
		const label = list.find((item) => item.id === labelId);
		if (label) return { list, label };
	}
}

/** 记录任务活动：data 形状由 ActivityDataByAction 按 action 约束（漏字段/错字段编译报错）。 */
/** seed 活动 data：按 ActivityDataByAction 校验形状（与记录端同一契约，编译期对齐）。 */
function activityData<A extends keyof ActivityDataByAction>(
	action: A,
	data: ActivityDataByAction[A],
): string {
	return JSON.stringify(data);
}

function recordActivity<A extends keyof ActivityDataByAction>(
	task: Task,
	action: A,
	data: ActivityDataByAction[A],
): Activity {
	const project = findProject(task.projectId);
	const activity: Activity = {
		id: newMockId("activity"),
		resourceType: "task",
		resourceId: task.id,
		action,
		actor: "Admin",
		projectName: project?.name ?? "",
		data: JSON.stringify(data),
		createdAt: now(),
	};
	getMockDb().activities.unshift({ ...activity, projectId: task.projectId });
	getMockDb().details[task.id]?.activity.unshift(activity);
	return activity;
}

export function recordTaskActivity<A extends keyof ActivityDataByAction>(
	task: Task,
	action: A,
	data: ActivityDataByAction[A],
): Activity {
	return recordActivity(task, action, data);
}

export function syncTask(task: Task): void {
	const detail = db.details[task.id];
	if (detail) {
		detail.task = task;
		detail.labels = task.labels ?? [];
		detail.projectName = findProject(task.projectId)?.name ?? "";
		detail.columnName =
			db.boards[task.projectId]?.columns.find(
				(column) => column.id === task.columnId,
			)?.name ?? "";
	}
}

export function createTask(column: BoardColumn, input: Partial<Task>): Task {
	// 完成打点口径与真实后端一致：创建时直接落在项目末列（max position）即视为完成；
	// 与 mock 的 dashboard trend.completed 统计（按 completedAt 日切）同源。
	const lastColumnId = [...(db.boards[column.projectId]?.columns ?? [])]
		.sort((a, b) => a.position - b.position)
		.at(-1)?.id;
	const task: Task = {
		id: newMockId("task"),
		projectId: column.projectId,
		columnId: column.id,
		title: input.title?.trim() || "新任务",
		description: input.description ?? null,
		position: column.tasks.filter((item) => !item.archivedAt).length,
		createdAt: now(),
		updatedAt: now(),
		priority: input.priority ?? "med",
		dueDate: input.dueDate ?? null,
		labels: [],
		completedAt: lastColumnId && column.id === lastColumnId ? now() : null,
	};
	// 创建时直接附加标签（快速捕获传入 label id 数组）。
	const labelIds = (input.labels ?? []).map((item) =>
		typeof item === "string" ? item : item.id,
	);
	const labels: Label[] = labelIds
		.map((id) =>
			db.boards[column.projectId]?.labels.find((label) => label.id === id),
		)
		.filter((label): label is Label => Boolean(label));
	task.labels = labels;
	column.tasks.push(task);
	const project = findProject(task.projectId);
	getMockDb().details[task.id] = {
		task,
		projectName: project?.name ?? "",
		columnName: column.name,
		labels,
		comments: [],
		activity: [],
	};
	recordActivity(task, "task.created", { title: task.title });
	return task;
}

export function projectSummaries(workspaceId: string): Project[] {
	return clone(db.projects[workspaceId] ?? []).map((project) => {
		const board = db.boards[project.id];
		const columns = board?.columns ?? [];
		const tasks =
			board?.columns
				.flatMap((column) => column.tasks)
				.filter((task) => !task.archivedAt) ?? [];
		// 「进行中」口径（模板无关）：不在首列（待办）也不在末列（已完成）。
		const firstId = columns[0]?.id;
		const lastId = columns.at(-1)?.id;
		const inProgress =
			board?.columns
				.flatMap((column) => column.tasks)
				.filter(
					(task) =>
						!task.archivedAt && task.columnId !== firstId && task.columnId !== lastId,
				).length ?? 0;
		return {
			...project,
			columnCount: columns.length,
			taskCount: tasks.length,
			inProgressCount: inProgress,
		};
	});
}

export function board(projectId: string): Board | undefined {
	return clone(db.boards[projectId]);
}
/** 当前登录成员：按 Authorization 密钥匹配成员；未匹配/无密钥时回退 owner。 */
export function me(authKey?: string): {
	member: Member | undefined;
	workspaceId: string;
	mode: "team";
} {
	const workspace = db.workspaces[0];
	const members = db.members[workspace?.id] ?? [];
	const owner = members.find((item) => item.role === "owner") ?? members[0];
	if (authKey) {
		const matchedId = Object.entries(db.memberKeys).find(
			([, key]) => key === authKey,
		)?.[0];
		const matched = members.find((item) => item.id === matchedId);
		if (matched)
			return { member: matched, workspaceId: workspace?.id ?? "", mode: "team" };
	}
	return { member: owner, workspaceId: workspace?.id ?? "", mode: "team" };
}

/** 为成员生成访问密钥（管理员授权）：已存在则原样返回。 */
export function generateMemberKey(memberId: string): string | undefined {
	const existing = db.memberKeys[memberId];
	if (existing) return existing;
	const member = Object.values(db.members)
		.flat()
		.find((item) => item.id === memberId);
	if (!member) return undefined;
	const key = `kanso-${Math.random().toString(36).slice(2, 10)}`;
	db.memberKeys[memberId] = key;
	persistMockDb();
	return key;
}

/** 工作区成员数量上限（个人版 5 人）。 */
export const MEMBER_LIMIT = 5;

/** 创建成员（普通成员）；超过上限返回错误文案。 */
export function createMember(
	workspaceId: string,
	name: string,
): { ok: true; member: Member } | { ok: false; error: string } {
	const list = db.members[workspaceId] ?? [];
	if (list.length >= MEMBER_LIMIT)
		return { ok: false, error: `成员数量已达上限（${MEMBER_LIMIT} 人）` };
	const member: Member = {
		id: newMockId("member"),
		workspaceId,
		name: name.trim(),
		role: "member",
	};
	list.push(member);
	return { ok: true, member: persistAnd(member) };
}

/** 删除成员：所有者不可删除；同时清理其访问密钥。 */
export function deleteMember(
	memberId: string,
): { ok: true } | { ok: false; error: string } {
	for (const list of Object.values(db.members)) {
		const index = list.findIndex((item) => item.id === memberId);
		if (index >= 0) {
			if (list[index].role === "owner")
				return { ok: false, error: "不能删除所有者" };
			list.splice(index, 1);
			delete db.memberKeys[memberId];
			persistMockDb();
			return { ok: true };
		}
	}
	return { ok: false, error: "成员不存在" };
}
export function taskDetail(taskId: string): TaskDetail | undefined {
	return clone(db.details[taskId]);
}
export function activities(): Activity[] {
	return clone(db.activities)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.map(({ projectId: _projectId, ...activity }) => activity);
}

export function dashboard(): DashboardData {
	const boards = Object.values(db.boards);
	const tasks = boards
		.flatMap((item) => item.columns.flatMap((column) => column.tasks))
		.filter((task) => !task.archivedAt);
	const done = boards.reduce(
		(sum, item) =>
			sum +
			(item.columns.at(-1)?.tasks.filter((task) => !task.archivedAt).length ?? 0),
		0,
	);
	const byColumn = new Map<string, number>();
	const byPriority = new Map<string, number>();
	for (const item of boards)
		for (const column of item.columns)
			for (const task of column.tasks)
				if (!task.archivedAt) {
					byColumn.set(column.name, (byColumn.get(column.name) ?? 0) + 1);
					byPriority.set(
						task.priority ?? "med",
						(byPriority.get(task.priority ?? "med") ?? 0) + 1,
					);
				}
	const trend = Array.from({ length: 14 }, (_, index) => {
		const date = new Date(Date.now() - (13 - index) * 86_400_000)
			.toISOString()
			.slice(0, 10);
		return {
			day: date,
			created: tasks.filter((task) => task.createdAt.slice(0, 10) === date).length,
			completed: tasks.filter(
				(task) => (task.completedAt ?? "").slice(0, 10) === date,
			).length,
		};
	});
	// 「已完成」= 位于项目末列（口径同 doneTasks）；末列任务不进「需要关注」。
	const lastColumnIds = new Set(
		boards.map((item) => item.columns.at(-1)?.id).filter(Boolean),
	);
	const focus = tasks
		.filter(
			(task) =>
				(task.priority === "urgent" || task.dueDate) &&
				!lastColumnIds.has(task.columnId),
		)
		.slice(0, 8)
		.map((task) => ({
			id: task.id,
			title: task.title,
			column:
				boards
					.find((item) => item.project.id === task.projectId)
					?.columns.find((column) => column.id === task.columnId)?.name ?? "",
			projectName: findProject(task.projectId)?.name ?? "",
			dueDate: task.dueDate ?? null,
			urgent: task.priority === "urgent",
		}));
	return {
		totalTasks: tasks.length,
		urgent: tasks.filter((task) => task.priority === "urgent").length,
		newThisWeek: tasks.filter(
			(task) => Date.now() - new Date(task.createdAt).getTime() < 7 * 86_400_000,
		).length,
		doneTasks: done,
		completionPercent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
		byColumn: [...byColumn].map(([name, count]) => ({ name, count })),
		byPriority: [...byPriority].map(([priority, count]) => ({ priority, count })),
		projects: boards.map((item) => {
			const all = item.columns
				.flatMap((column) => column.tasks)
				.filter((task) => !task.archivedAt);
			return {
				id: item.project.id,
				workspaceId: item.project.workspaceId,
				name: item.project.name,
				done:
					item.columns.at(-1)?.tasks.filter((task) => !task.archivedAt).length ?? 0,
				total: all.length,
			};
		}),
		focus,
		recentActivity: activities()
			.slice(0, 8)
			.map((item) => ({
				id: item.id,
				projectName: item.projectName,
				action: item.action,
				data: item.data ?? null,
				actor: item.actor ?? "Admin",
				createdAt: item.createdAt,
			})),
		trend,
	};
}

export function backup(): Record<string, unknown> {
	const columns: Column[] = Object.values(db.boards).flatMap((item) =>
		item.columns.map(({ tasks: _tasks, ...column }) => column),
	);
	const tasks = Object.values(db.boards).flatMap((item) =>
		item.columns.flatMap((column) => column.tasks),
	);
	const taskLabels = tasks.flatMap((task) =>
		(task.labels ?? []).map((label) => ({ taskId: task.id, labelId: label.id })),
	);
	return {
		exportedAt: now(),
		workspaces: clone(db.workspaces),
		projects: clone(Object.values(db.projects).flat()),
		columns: clone(columns),
		tasks: clone(tasks),
		labels: clone(Object.values(db.labels).flat()),
		taskLabels,
		taskMilestones: clone(
			Object.entries(db.taskMilestones).flatMap(([taskId, milestoneIds]) =>
				milestoneIds.map((milestoneId) => ({ taskId, milestoneId })),
			),
		),
		comments: clone(
			Object.values(db.details).flatMap((detail) => detail.comments),
		),
		activities: clone(
			Object.values(db.details).flatMap((detail) => detail.activity),
		),
	};
}

export function search(query: string): SearchHit[] {
	const q = query.trim().toLowerCase();
	const rows = Object.values(db.boards).flatMap((item) =>
		item.columns.flatMap((column) =>
			column.tasks.map((task) => ({ task, column, project: item.project })),
		),
	);
	return rows
		.filter(
			({ task }) =>
				!q || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(q),
		)
		.slice(0, 20)
		.map(({ task, column, project }) => ({
			id: task.id,
			title: task.title,
			columnId: column.id,
			priority: task.priority ?? "med",
			dueDate: task.dueDate ?? null,
			projectId: project.id,
			projectName: project.name,
			workspaceId: project.workspaceId,
			workspaceName:
				db.workspaces.find((workspace) => workspace.id === project.workspaceId)
					?.name ?? "",
		}));
}

export function persistAnd<T>(value: T): T {
	persistMockDb();
	return value;
}
