// 最近打开的项目记录（localStorage）：仪表盘"项目速览"按此展示最近打开的 N 个项目。
// 进入项目看板（/w/:wid/p/:pid）时写入；按工作区记录，最新在前，重复打开去重置顶。
const STORAGE_KEY = "kaneo:recent-projects";
const MAX_PER_WORKSPACE = 20;
const MAX_TOTAL = 100;

export interface RecentProjectEntry {
	workspaceId: string;
	projectId: string;
	ts: number;
}

function read(): RecentProjectEntry[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as RecentProjectEntry[]) : [];
	} catch {
		return [];
	}
}

function write(entries: RecentProjectEntry[]): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// 持久化尽力而为：隐私模式或配额不足时静默失败
	}
}

/** 打开项目时调用：同工作区同项目去重，并把该项目置顶。 */
export function recordProjectOpen(
	workspaceId: string,
	projectId: string,
): void {
	const all = read();
	const rest = all.filter((e) => e.workspaceId !== workspaceId);
	const scoped = all
		.filter((e) => e.workspaceId === workspaceId && e.projectId !== projectId)
		.slice(0, MAX_PER_WORKSPACE - 1);
	scoped.unshift({ workspaceId, projectId, ts: Date.now() });
	write([...scoped, ...rest.slice(0, MAX_TOTAL)]);
}

/** 某工作区最近打开的项目，按打开时间倒序，最多 limit 个。 */
export function getRecentProjects(
	workspaceId: string,
	limit: number,
): RecentProjectEntry[] {
	return read()
		.filter((e) => e.workspaceId === workspaceId)
		.slice(0, limit);
}

/** 全部工作区最近打开的项目（仪表盘全局视图用），按打开时间倒序，最多 limit 个。 */
export function getRecentProjectsAll(limit: number): RecentProjectEntry[] {
	return [...read()].sort((a, b) => b.ts - a.ts).slice(0, limit);
}
