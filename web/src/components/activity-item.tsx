// ActivityItem —— 单条活动记录的统一渲染单元（深化候选 1，见架构审查 2026-08）。
// 吃结构化字段 {projectName, action}，内部持有「在 X 中，你 Y」句子模板与 projectName 高亮；
// 时间由消费方渲染（布局与时间格式属于消费方——活动页竖排、仪表盘网格 truncate）。
// 活动页与仪表盘「最近活动」共用；任务详情的紧凑句式（「Admin · 动作」）不接入。
import { ACTION_LABELS } from "@/lib/events";
import { formatActivityText } from "@/lib/activity";
import { cn } from "@/lib/cn";

export type ActivityItemProps = {
	projectName: string;
	action: string;
	/** 可选：整行 className（消费方控制布局/间距/截断）。 */
	className?: string;
	/** 可选：项目名高亮色（默认 text-primary，与 activity 页一致）。 */
	projectNameClassName?: string;
};

export default function ActivityItem({
	projectName,
	action,
	className,
	projectNameClassName,
}: ActivityItemProps) {
	return (
		<span className={cn("min-w-0 flex-1 truncate", className)}>
			{"在 "}
			<span className={cn("font-medium text-primary", projectNameClassName)}>
				{projectName}
			</span>
			{" 中，"}
			<span className="font-medium text-foreground">你</span>{" "}
			{ACTION_LABELS[action] ?? action}
		</span>
	);
}

// 纯文本导出：无 JSX 场景（aria-label、测试、未来文本摘要）复用同一句子模板。
export { formatActivityText };
