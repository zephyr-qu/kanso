import { ACTION_LABELS } from "@/lib/events";
import { activityDetail } from "@/lib/activity";
import { formatDateTime } from "@/lib/format-relative";
import { SectionLabel } from "@/components/task-detail/section-label";
import type { Activity } from "@/types/task-detail";

type TaskDetailActivityProps = {
	activity: Activity[];
	projectName: string;
};

export function TaskDetailActivity({ activity, projectName }: TaskDetailActivityProps) {
	return (
		<section className="kanso-task-detail__section">
			<SectionLabel>活动记录</SectionLabel>
			{activity.length === 0 ? (
				<p className="text-xs text-muted-foreground">暂无活动</p>
			) : (
				<ol className="kanso-detail-timeline">
					{activity.map((item, index) => (
						<li key={item.id} className="kanso-detail-timeline__item">
							<span
								className={`kanso-detail-timeline__dot ${index === 0 ? "is-current" : ""}`}
							/>
							<div className="kanso-detail-timeline__body">
								<div className="kanso-detail-timeline__text">
									<span>在 </span>
									<strong>{item.projectName || projectName || "—"}</strong>
									<span>
										{" "}
										中，{item.actor || "—"} {ACTION_LABELS[item.action] ?? item.action}
										{activityDetail(item.action, item.data)}
									</span>
								</div>
								<div className="kanso-detail-timeline__time">{formatDateTime(item.createdAt)}</div>
							</div>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
