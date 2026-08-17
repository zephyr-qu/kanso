// 全局活动记录：对齐原型的单卡片操作轨迹布局。
import { useQuery } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";
import ActivityItem from "@/components/activity-item";
import { activityIconForAction } from "@/components/activity-icon";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { groupActivitiesByDay, type FlatActivity } from "@/lib/activity";
import { queryKeys } from "@/hooks/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import { formatActivityAge } from "@/lib/format-relative";

export default function ActivityPage() {
	// 全局实时订阅：任何变更（含备份导入）失效活动流查询。
	useRealtime(undefined);
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.activities(),
		queryFn: () => api<FlatActivity[]>(buildPath("activity")),
	});

	const activities = data
		? groupActivitiesByDay(data).flatMap((group) => group.items)
		: [];

	return (
		<div className="flex h-full flex-col">
			<PageHeader>
				<h1 aria-label="活动" className="text-[17px] font-[650] tracking-tight">
					活动记录
				</h1>
				<span className="text-[13px] text-muted-foreground">
					全部工作区 · 操作轨迹
				</span>
			</PageHeader>

			<PageContent className="px-[30px] pb-11 pt-[26px]">
				{isLoading ? (
					<div className="flex justify-center py-16"><Spinner /></div>
				) : isError ? (
					<p className="py-16 text-center text-sm text-destructive">加载活动失败</p>
				) : activities.length === 0 ? (
					<SurfaceCard className="px-5 py-12 text-center">
						<HistoryIcon className="mx-auto size-5 text-muted-foreground/45" />
						<p className="mt-3 text-sm text-muted-foreground">还没有活动记录</p>
					</SurfaceCard>
				) : (
					<SurfaceCard className="kanso-activity-card px-5 py-4">
						{activities.map((activity) => (
							<ActivityRow key={activity.id} activity={activity} />
						))}
					</SurfaceCard>
				)}
			</PageContent>
		</div>
	);
}

function ActivityRow({ activity }: { activity: FlatActivity }) {
	const Icon = activityIconForAction(activity.action);
	return (
		<div className="kanso-recent-activity__row">
			<span className="kanso-recent-activity__icon" aria-hidden="true">
				<Icon />
			</span>
			<div className="kanso-recent-activity__body">
				<ActivityItem
					projectName={activity.projectName}
					action={activity.action}
					data={activity.data}
					actor={activity.actor}
					className="block"
				/>
				<div className="kanso-recent-activity__time">
					{formatActivityAge(activity.createdAt)}
				</div>
			</div>
		</div>
	);
}

// formatActivityAge 已提取至 lib/format-relative（S-11，与仪表盘共用）。
