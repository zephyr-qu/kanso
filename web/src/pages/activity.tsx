// 全局活动页：跨项目活动时间线，按日分组（今天/昨天/更早），组内时间倒序。
// 数据来自 /api/activity（mock 与仪表盘共用拍平逻辑；对接后由真实端点提供）。
// 条目渲染与仪表盘最近活动共用 ActivityItem（活动文案与高亮一处定义）。
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import ActivityItem from "@/components/activity-item";
import { api } from "@/lib/api";
import {
	groupActivitiesByDay,
	type FlatActivity,
} from "@/lib/activity";
import { queryKeys } from "@/hooks/query-keys";
import { formatClock } from "@/lib/format-relative";


export default function ActivityPage() {
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.activities(),
		queryFn: () => api<FlatActivity[]>("/api/activity"),
	});

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center border-b px-6">
				<h1 className="text-[17px] font-[650] tracking-tight">活动</h1>
			</div>

			<div className="flex-1 overflow-auto px-8 pb-12 pt-7">
				{isLoading ? (
					<div className="flex justify-center py-16">
						<Spinner />
					</div>
				) : isError ? (
					<p className="py-16 text-center text-sm text-destructive">
						加载活动失败
					</p>
				) : !data || data.length === 0 ? (
					<p className="py-16 text-center text-sm text-muted-foreground">
						还没有活动记录
					</p>
				) : (
					<div className="space-y-6">
						{/* 对齐原型 #activity：全宽内容、11px 大写 day-label、a-item 圆点 + 蓝色项目名。 */}
						{groupActivitiesByDay(data).map((group) => (
							<section key={group.key}>
								<h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
									{group.key}
								</h2>
								<ul className="flex flex-col">
									{group.items.map((a) => (
										<li
											key={a.id}
											className="flex items-baseline gap-2.5 rounded-lg px-2 py-2 text-[13px] leading-[1.5] transition-colors hover:bg-[rgba(24,24,27,0.04)]"
										>
											<span className="mt-[6px] size-[7px] shrink-0 self-start rounded-full bg-border" />
											<ActivityItem
												projectName={a.projectName}
												action={a.action}
											/>
											<span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
												{formatClock(a.createdAt)}
											</span>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
