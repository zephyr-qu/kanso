// M5:里程碑详情面板——点击项目页进度卡打开,查看该里程碑的进度与关联任务(可点进任务)。
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { Spinner } from "@/components/ui/spinner";
import {
	Dialog,
	DialogBackdrop,
	DialogDescription,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Milestone } from "@/types/board";

type MilestoneTask = {
	id: string;
	title: string;
	columnName: string;
	archived: boolean;
};

export default function MilestoneDetailDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	milestone: Milestone | null;
	workspaceId: string;
	projectId: string;
}) {
	const navigate = useNavigate();
	const { milestone, open } = props;

	const { data: tasks, isLoading } = useQuery({
		queryKey: ["milestone-tasks", milestone?.id],
		queryFn: () =>
			api<MilestoneTask[]>(buildPath("milestoneTasks", { id: milestone!.id })),
		enabled: open && !!milestone,
	});

	const pct =
		milestone?.progress && milestone.progress.total > 0
			? Math.round((milestone.progress.done / milestone.progress.total) * 100)
			: 0;

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>{milestone?.name ?? "里程碑"}</DialogTitle>
						<DialogDescription>
							{milestone?.dueDate ? `截止 ${milestone.dueDate}` : "未设截止"} · 进度{" "}
							{pct}%
						</DialogDescription>
					</DialogHeader>
					<DialogPanel className="space-y-4">
						{/* 进度 */}
						{milestone?.progress ? (
							<div>
								<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary"
										style={{ width: `${pct}%` }}
									/>
								</div>
								<div className="mt-1 text-right text-xs text-muted-foreground">
									{milestone.progress.done}/{milestone.progress.total} 完成
								</div>
							</div>
						) : null}

						<div className="text-xs font-medium text-muted-foreground">
							关联任务 {tasks?.length ?? 0}
						</div>

						{isLoading ? (
							<div className="flex justify-center py-6">
								<Spinner />
							</div>
						) : tasks && tasks.length > 0 ? (
							<ul className="max-h-72 space-y-1 overflow-auto pr-1">
								{tasks.map((t) => (
									<li key={t.id}>
										<button
											type="button"
											className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent/50"
											onClick={() => {
												props.onOpenChange(false);
												navigate(`/w/${props.workspaceId}/p/${props.projectId}/t/${t.id}`);
											}}
										>
											<span className="min-w-0 flex-1 truncate">{t.title}</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{t.columnName}
											</span>
											{t.archived ? (
												<span className="shrink-0 text-xs text-muted-foreground">
													已归档
												</span>
											) : null}
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="py-4 text-center text-xs text-muted-foreground">
								该里程碑暂无关联任务，可在任务详情勾选
							</p>
						)}
					</DialogPanel>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
