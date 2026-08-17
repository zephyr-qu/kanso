// 活动动作 → 图标：精确 key 映射（与 lib/events.ts ACTION_LABELS 同源常量）。
// 此前用 includes() 字符串匹配，会误中未来任何含 "moved"/"created" 的动作；未知动作回退 History。
import type { LucideIcon } from "lucide-react";
import {
	ArchiveIcon,
	ArrowRightIcon,
	HistoryIcon,
	MessageSquareIcon,
	PlusIcon,
} from "lucide-react";
import { EVENT_TYPES } from "@/lib/events";

const ICONS: Record<string, LucideIcon> = {
	[EVENT_TYPES.taskMoved]: ArrowRightIcon,
	[EVENT_TYPES.columnMoved]: ArrowRightIcon,
	[EVENT_TYPES.taskCreated]: PlusIcon,
	[EVENT_TYPES.milestoneCreated]: PlusIcon,
	[EVENT_TYPES.columnCreated]: PlusIcon,
	[EVENT_TYPES.labelCreated]: PlusIcon,
	[EVENT_TYPES.commentCreated]: PlusIcon,
	[EVENT_TYPES.memberCreated]: PlusIcon,
	[EVENT_TYPES.commentDeleted]: MessageSquareIcon,
	[EVENT_TYPES.taskArchived]: ArchiveIcon,
	[EVENT_TYPES.taskRestored]: ArchiveIcon,
};

export function activityIconForAction(action: string): LucideIcon {
	return ICONS[action] ?? HistoryIcon;
}
