import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetMockDb } from "@/mocks/mock-db";
import { server } from "@/mocks/server";

type JsonObject = Record<string, unknown>;

const json = async <T>(path: string): Promise<{ response: Response; body: T }> => {
	const response = await fetch(`http://localhost${path}`);
	return { response, body: (await response.json()) as T };
};

function object(value: unknown, path: string): JsonObject {
	expect(value, path).toBeTypeOf("object");
	expect(value, path).not.toBeNull();
	return value as JsonObject;
}

function string(value: unknown, path: string): void {
	expect(value, path).toBeTypeOf("string");
}

function number(value: unknown, path: string): void {
	expect(value, path).toBeTypeOf("number");
}

function nullableString(value: unknown, path: string): void {
	if (value !== null) string(value, path);
}

function array(value: unknown, path: string): unknown[] {
	expect(value, path).toBeInstanceOf(Array);
	return value as unknown[];
}

function responseIsJson(response: Response, status: number): void {
	expect(response.status).toBe(status);
	expect(response.headers.get("content-type")).toContain("application/json");
}

function assertWorkspace(value: unknown, path: string): void {
	const item = object(value, path);
	string(item.id, `${path}.id`);
	string(item.name, `${path}.name`);
	string(item.createdAt, `${path}.createdAt`);
}

function assertProject(value: unknown, path: string): void {
	const item = object(value, path);
	string(item.id, `${path}.id`);
	string(item.workspaceId, `${path}.workspaceId`);
	string(item.name, `${path}.name`);
	number(item.position, `${path}.position`);
	string(item.createdAt, `${path}.createdAt`);
	string(item.updatedAt, `${path}.updatedAt`);
}

function assertTask(value: unknown, path: string): void {
	const item = object(value, path);
	for (const field of ["id", "projectId", "columnId", "title", "createdAt", "updatedAt"]) {
		string(item[field], `${path}.${field}`);
	}
	nullableString(item.description, `${path}.description`);
	number(item.position, `${path}.position`);
	if (item.priority !== undefined) nullableString(item.priority, `${path}.priority`);
	if (item.dueDate !== undefined) nullableString(item.dueDate, `${path}.dueDate`);
	if (item.archivedAt !== undefined) nullableString(item.archivedAt, `${path}.archivedAt`);
	if (item.completedAt !== undefined) nullableString(item.completedAt, `${path}.completedAt`);
	if (item.labels !== undefined) {
		for (const [index, label] of array(item.labels, `${path}.labels`).entries()) {
			assertLabel(label, `${path}.labels[${index}]`);
		}
	}
}

function assertLabel(value: unknown, path: string): void {
	const item = object(value, path);
	string(item.id, `${path}.id`);
	string(item.projectId, `${path}.projectId`);
	string(item.name, `${path}.name`);
	string(item.createdAt, `${path}.createdAt`);
}

function assertBoard(value: unknown): { projectId: string; taskId: string } {
	const board = object(value, "board");
	assertProject(board.project, "board.project");
	const projectId = (board.project as JsonObject).id as string;
	const columns = array(board.columns, "board.columns");
	let taskId = "";
	for (const [columnIndex, columnValue] of columns.entries()) {
		const column = object(columnValue, `board.columns[${columnIndex}]`);
		for (const field of ["id", "projectId", "name", "createdAt"]) {
			string(column[field], `board.columns[${columnIndex}].${field}`);
		}
		number(column.position, `board.columns[${columnIndex}].position`);
		for (const [taskIndex, task] of array(column.tasks, `board.columns[${columnIndex}].tasks`).entries()) {
			assertTask(task, `board.columns[${columnIndex}].tasks[${taskIndex}]`);
			if (!taskId) taskId = (task as JsonObject).id as string;
		}
	}
	for (const [labelIndex, label] of array(board.labels, "board.labels").entries()) {
		assertLabel(label, `board.labels[${labelIndex}]`);
	}
	return { projectId, taskId };
}

function assertActivity(value: unknown, path: string): void {
	const item = object(value, path);
	for (const field of ["id", "resourceType", "resourceId", "action", "actor", "projectName", "createdAt"]) {
		string(item[field], `${path}.${field}`);
	}
	nullableString(item.data, `${path}.data`);
}

describe("API response contract", () => {
	beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
	afterEach(() => {
		server.resetHandlers();
		resetMockDb();
	});
	afterAll(() => server.close());

	it("keeps workspace, project and board aggregates aligned with frontend types", async () => {
		const workspaces = await json<unknown>("/api/workspaces");
		responseIsJson(workspaces.response, 200);
		const workspaceItems = array(workspaces.body, "workspaces");
		workspaceItems.forEach((item, index) => assertWorkspace(item, `workspaces[${index}]`));
		const workspaceId = (workspaceItems[0] as JsonObject).id as string;

		const projects = await json<unknown>(`/api/workspaces/${workspaceId}/projects`);
		responseIsJson(projects.response, 200);
		const projectItems = array(projects.body, "projects");
		projectItems.forEach((item, index) => assertProject(item, `projects[${index}]`));
		const projectId = (projectItems[0] as JsonObject).id as string;

		const board = await json<unknown>(`/api/projects/${projectId}`);
		responseIsJson(board.response, 200);
		const ids = assertBoard(board.body);
		expect(ids.projectId).toBe(projectId);
		expect(ids.taskId).toBeTruthy();
	});

	it("keeps task detail, milestone and activity aggregates structurally stable", async () => {
		const board = await json<unknown>("/api/projects/mock-project");
		const { taskId, projectId } = assertBoard(board.body);

		const detail = await json<unknown>(`/api/tasks/${taskId}`);
		responseIsJson(detail.response, 200);
		const detailValue = object(detail.body, "taskDetail");
		assertTask(detailValue.task, "taskDetail.task");
		string(detailValue.projectName, "taskDetail.projectName");
		string(detailValue.columnName, "taskDetail.columnName");
		for (const [index, label] of array(detailValue.labels, "taskDetail.labels").entries()) {
			assertLabel(label, `taskDetail.labels[${index}]`);
		}
		for (const [index, commentValue] of array(detailValue.comments, "taskDetail.comments").entries()) {
			const comment = object(commentValue, `taskDetail.comments[${index}]`);
			for (const field of ["id", "taskId", "author", "content", "createdAt"]) {
				string(comment[field], `taskDetail.comments[${index}].${field}`);
			}
		}
		for (const [index, activity] of array(detailValue.activity, "taskDetail.activity").entries()) {
			assertActivity(activity, `taskDetail.activity[${index}]`);
		}

		const milestones = await json<unknown>(`/api/projects/${projectId}/milestones`);
		responseIsJson(milestones.response, 200);
		for (const [index, value] of array(milestones.body, "milestones").entries()) {
			const milestone = object(value, `milestones[${index}]`);
			for (const field of ["id", "projectId", "name", "createdAt"]) {
				string(milestone[field], `milestones[${index}].${field}`);
			}
			nullableString(milestone.dueDate, `milestones[${index}].dueDate`);
			if (milestone.progress !== undefined && milestone.progress !== null) {
				const progress = object(milestone.progress, `milestones[${index}].progress`);
				number(progress.done, `milestones[${index}].progress.done`);
				number(progress.total, `milestones[${index}].progress.total`);
			}
		}

		const activities = await json<unknown>("/api/activity");
		responseIsJson(activities.response, 200);
		for (const [index, activity] of array(activities.body, "activities").entries()) {
			assertActivity(activity, `activities[${index}]`);
		}
	});

	it("keeps dashboard, search, backup and health response envelopes stable", async () => {
		const dashboard = await json<unknown>("/api/dashboard");
		responseIsJson(dashboard.response, 200);
		const dashboardValue = object(dashboard.body, "dashboard");
		for (const field of ["totalTasks", "urgent", "newThisWeek", "doneTasks", "completionPercent"]) {
			number(dashboardValue[field], `dashboard.${field}`);
		}
		for (const [index, item] of array(dashboardValue.byColumn, "dashboard.byColumn").entries()) {
			const value = object(item, `dashboard.byColumn[${index}]`);
			string(value.name, `dashboard.byColumn[${index}].name`);
			number(value.count, `dashboard.byColumn[${index}].count`);
		}
		for (const [index, item] of array(dashboardValue.trend, "dashboard.trend").entries()) {
			const value = object(item, `dashboard.trend[${index}]`);
			string(value.day, `dashboard.trend[${index}].day`);
			number(value.created, `dashboard.trend[${index}].created`);
			number(value.completed, `dashboard.trend[${index}].completed`);
		}

		const search = await json<unknown>("/api/search?q=任务");
		responseIsJson(search.response, 200);
		for (const [index, value] of array(search.body, "search").entries()) {
			const hit = object(value, `search[${index}]`);
			for (const field of ["id", "title", "columnId", "priority", "projectId", "projectName", "workspaceId", "workspaceName"]) {
				string(hit[field], `search[${index}].${field}`);
			}
			nullableString(hit.dueDate, `search[${index}].dueDate`);
		}

		const backup = await json<unknown>("/api/settings/backup");
		responseIsJson(backup.response, 200);
		const backupValue = object(backup.body, "backup");
		string(backupValue.exportedAt, "backup.exportedAt");
		for (const field of ["workspaces", "projects", "columns", "tasks", "labels", "taskLabels", "taskMilestones", "comments", "activities"]) {
			array(backupValue[field], `backup.${field}`);
		}

		const health = await json<unknown>("/api/health");
		responseIsJson(health.response, 200);
		const healthValue = object(health.body, "health");
		expect(healthValue.ok).toBe(true);
		string(healthValue.name, "health.name");
		string(healthValue.version, "health.version");
	});
});
