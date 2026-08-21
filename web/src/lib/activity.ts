// 全局活动流的共享纯函数：文案格式化与按日分组。
// 仪表盘最近活动面板与活动页（/activity）共用，避免重复实现（ticket 04）。
import { ACTION_LABELS, type ActivityDataByAction } from "@/lib/events";

// 拍平后的活动流条目（mock /api/activity 与未来后端契约的形状）。
export type FlatActivity = {
	id: string;
	resourceType?: string;
	resourceId?: string;
	projectName: string;
	action: string;
	actor?: string;
	data?: string | null;
	createdAt: string;
};

/** 解析活动 data（JSON 字符串）；解析失败返回空对象。 */
export function parseActivityData(
	data: string | null | undefined,
): Record<string, unknown> {
	if (!data) return {};
	try {
		const value: unknown = JSON.parse(data);
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

// 评论正文过长时截断（活动流里只保留开头）。
const MAX_COMMENT = 40;

/** 按 action 读取类型化 data（契约见 lib/events.ts ActivityDataByAction）。
 *  运行时宽松：字段缺失/类型不符返回 undefined，调用方据此省略详情，不抛错、不信任旧数据。 */
function dataFor<A extends keyof ActivityDataByAction>(
	action: A,
	data: string | null | undefined,
): Partial<ActivityDataByAction[A]> {
	return parseActivityData(data) as Partial<ActivityDataByAction[A]>;
}

/** 按 action + data 生成动作细节后缀（如「『全局搜索』」「（待办 → 进行中）」）。
 *  data 形状与后端契约对齐：task.moved 为 { from, to }（列 ID），
 *  mock 额外带 fromName/toName 供展示；无名字时（真实后端）移动详情省略，避免泄露内部 ID。 */
export function activityDetail(
	action: string,
	data: string | null | undefined,
): string {
	switch (action) {
		case "task.created":
		case "task.updated": {
			const title = dataFor("task.created", data).title;
			return title ? `「${title}」` : "";
		}
		case "task.moved": {
			const moved = dataFor("task.moved", data);
			// 仅展示列名；真实后端只传列 ID 时省略详情（避免泄露内部 ID）。
			const from = moved.fromName;
			const to = moved.toName;
			return from && to && from !== to ? `（${from} → ${to}）` : "";
		}
		case "task.archived":
		case "task.restored": {
			// 「归档了任务『标题』/恢复了任务『标题』」——明确是哪张任务（真实后端 data 带 title）。
			const title = dataFor("task.archived", data).title;
			return title ? `「${title}」` : "";
		}
		case "column.created":
		case "column.updated":
		case "column.moved":
		case "column.deleted":
		case "label.created":
		case "label.updated":
		case "label.deleted":
		case "milestone.created":
		case "milestone.updated":
		case "milestone.deleted":
		case "member.created":
		case "member.updated":
		case "member.deleted":
		case "workspace.created":
		case "workspace.updated":
		case "workspace.deleted":
		case "project.created":
		case "project.updated":
		case "project.deleted":
		case "project.pinned":
		case "project.unpinned": {
			const value = parseActivityData(data).name;
			return typeof value === "string" && value ? `「${value}」` : "";
		}
		case "label.attached":
		case "label.detached": {
			const label = dataFor("label.attached", data).label;
			return label ? `「${label}」` : "";
		}
		case "milestone.attached":
		case "milestone.detached": {
			const milestone = dataFor("milestone.attached", data);
			const name = milestone.milestoneName || milestone.milestoneId;
			return name ? `「${name}」` : "";
		}
		case "comment.created":
		case "comment.deleted": {
			const content = dataFor("comment.created", data).content;
			return content ? `「${truncate(content, MAX_COMMENT)}」` : "";
		}
		default:
			return "";
	}
}

// 活动文案：未识别动作回退显示原始字符串；data 提供动作细节（标题/标签/列名等）。
/** 句子片段（单一来源）：ActivityItem 的 JSX（project/actor 高亮）与纯文本 formatActivityText 共同派生。
 *  句子模板只在这里拼一次，aria-label 与可见文本不可能再分叉。 */
export type ActivitySentenceParts = {
	pre: string;
	project: string;
	mid: string;
	actor: string;
	/** 动作动词 + 细节后缀（已含 activityDetail）。 */
	verb: string;
	detail: string;
};

export function activitySentenceParts(
	projectName: string,
	action: string,
	data?: string | null,
	actor = "你",
): ActivitySentenceParts {
	return {
		pre: "在 ",
		project: projectName,
		mid: " 中，",
		actor,
		verb: ACTION_LABELS[action] ?? action,
		detail: activityDetail(action, data),
	};
}

// 活动文案：未识别动作回退显示原始字符串；data 提供动作细节（标题/标签/列名等）。
export function formatActivityText(
	projectName: string,
	action: string,
	data?: string | null,
): string {
	const parts = activitySentenceParts(projectName, action, data);
	return `${parts.pre}${parts.project}${parts.mid}${parts.actor} ${parts.verb}${parts.detail}`;
}

export type ActivityGroupKey = "今天" | "昨天" | "更早";

// 按日分组（今天/昨天/更早），组内按时间倒序；空组不返回。
export function groupActivitiesByDay(
	activities: FlatActivity[],
): { key: ActivityGroupKey; items: FlatActivity[] }[] {
	const now = new Date();
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const DAY_MS = 86_400_000;

	const groups: Record<ActivityGroupKey, FlatActivity[]> = {
		今天: [],
		昨天: [],
		更早: [],
	};
	for (const a of activities) {
		const t = new Date(a.createdAt).getTime();
		const key: ActivityGroupKey =
			t >= startOfToday ? "今天" : t >= startOfToday - DAY_MS ? "昨天" : "更早";
		groups[key].push(a);
	}

	return (["今天", "昨天", "更早"] as const)
		.filter((key) => groups[key].length > 0)
		.map((key) => ({
			key,
			items: groups[key].sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			),
		}));
}
