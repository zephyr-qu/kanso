// ActivityItem —— 单条活动记录的统一渲染单元（深化候选 1，见架构审查 2026-08）。
// 吃结构化字段 {projectName, action, data}，句子模板由 activitySentenceParts 单一来源派生（候选 6）：
// JSX 与 formatActivityText 纯文本共用同一片段，project/actor 高亮只发生在渲染层。
// 时间由消费方渲染（布局与时间格式属于消费方——活动页竖排、仪表盘网格 truncate）。
// 活动页、仪表盘「最近活动」、任务详情时间线共用同一套文案（细节经 activityDetail 从 data 展开）。
import { activitySentenceParts, formatActivityText } from "@/lib/activity";
import { cn } from "@/lib/cn";

export type ActivityItemProps = {
	projectName: string;
	action: string;
	/** 活动载荷（JSON 字符串），提供动作细节（标题/标签/列名/评论等）。 */
	data?: string | null;
	/** 执行者名（后端返回的 actor；缺省显示「你」）。 */
	actor?: string;
	/** 可选：整行 className（消费方控制布局/间距/截断）。 */
	className?: string;
	/** 可选：项目名高亮色（默认 text-primary，与 activity 页一致）。 */
	projectNameClassName?: string;
};

export default function ActivityItem({
	projectName,
	action,
	data,
	actor,
	className,
	projectNameClassName,
}: ActivityItemProps) {
	const parts = activitySentenceParts(projectName, action, data, actor);
	return (
		<span className={cn("min-w-0 flex-1 truncate", className)}>
			{parts.pre}
			<span className={cn("font-semibold text-primary", projectNameClassName)}>
				{parts.project}
			</span>
			{parts.mid}
			<span className="font-medium text-foreground">{parts.actor}</span>{" "}
			{parts.verb}
			{parts.detail}
		</span>
	);
}

// 纯文本导出：无 JSX 场景（aria-label、测试、未来文本摘要）复用同一句子模板。
export { formatActivityText };
