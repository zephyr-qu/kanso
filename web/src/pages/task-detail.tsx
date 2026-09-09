// 任务详情页：描述编辑 / 评论 / 活动时间线（/w/:wid/p/:pid/t/:tid）。
// 页面只负责数据查询、mutation 和抽屉编排，内容区域拆到 task-detail 模块中。
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import ConfirmDialog from "@/components/confirm-dialog";
import { PageContent } from "@/components/kanso-ui";
import { Spinner } from "@/components/ui/spinner";
import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { useCommentMutations } from "@/hooks/use-comment-mutations";
import { useLabelMutations } from "@/hooks/use-label-mutations";
import { useMilestoneMutations } from "@/hooks/use-milestone-mutations";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import type { Board, Milestone } from "@/types/board";
import type { TaskDetail } from "@/types/task-detail";
import { TaskDetailActivity } from "@/components/task-detail/task-detail-activity";
import { TaskDetailComments } from "@/components/task-detail/task-detail-comments";
import { TaskDetailDescription } from "@/components/task-detail/task-detail-description";
import { TaskDetailHeader } from "@/components/task-detail/task-detail-header";
import { TaskDetailSummary } from "@/components/task-detail/task-detail-summary";

export default function TaskDetailPage() {
	const { workspaceId = "", projectId = "", taskId = "" } = useParams();
	const navigate = useNavigate();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.task(taskId),
		queryFn: () => api<TaskDetail>(buildPath("task", { id: taskId })),
		enabled: taskId !== "",
	});

	// 实时：项目事件推送后 invalidate 本页查询（含 board，返回看板时同步）。
	useRealtime(projectId, { workspaceId });
	// M5：任务归属里程碑（项目全部供选择，可多选）。
	const milestoneQuery = useQuery({
		queryKey: queryKeys.milestones(projectId),
		queryFn: () => api<Milestone[]>(buildPath("projectMilestones", { id: projectId })),
		enabled: projectId !== "",
	});
	// 项目标签库复用看板查询缓存，供详情页标签多选器使用。
	const boardQuery = useQuery({
		queryKey: queryKeys.board(projectId),
		queryFn: () => api<Board>(buildPath("project", { id: projectId })),
		enabled: projectId !== "",
	});
	const taskOps = useTaskMutations(projectId, workspaceId);
	const labelOps = useLabelMutations(projectId, workspaceId);
	const milestoneOps = useMilestoneMutations(projectId, workspaceId);
	const commentOps = useCommentMutations(taskId);

	const close = useCallback(() => {
		navigate(`/w/${workspaceId}/p/${projectId}`);
	}, [navigate, projectId, workspaceId]);

	// Esc 关闭抽屉（输入框内 Esc 保留给标题/描述/评论自身的取消编辑）。
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase() ?? "";
			if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
			close();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	return (
		<div
			className="fixed inset-0 z-50"
			role="dialog"
			aria-modal="true"
			aria-label="任务详情"
		>
			<div
				className="absolute inset-0 bg-black/30 animate-fade-in motion-reduce:animate-none"
				onClick={close}
			/>
			<div
				data-testid="task-detail-drawer"
				className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-background shadow-2xl animate-drawer-in motion-reduce:animate-none"
			>
				<TaskDetailHeader
					workspaceId={workspaceId}
					projectId={projectId}
					data={data}
					onArchive={() => taskOps.setArchived.mutate({ id: taskId, archived: !data?.task.archivedAt })}
					onDelete={() => setDeleteOpen(true)}
					onClose={close}
				/>

				{isLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Spinner />
					</div>
				) : isError || !data ? (
					<p className="py-16 text-center text-sm text-destructive">加载任务详情失败</p>
				) : (
					<PageContent className="kanso-task-detail px-5 pb-11 pt-6">
						<div className="kanso-task-detail__wrap">
							<TaskDetailSummary
								data={data}
								labels={boardQuery.data?.labels}
								milestones={milestoneQuery.data}
								onUpdate={(patch) => taskOps.updateTask.mutate({ id: taskId, ...patch })}
								onToggleLabel={(labelId, attach) =>
									labelOps.toggleLabel.mutate({ taskId, labelId, attach })
								}
								onToggleMilestone={(milestoneId, attach) =>
									milestoneOps.attach.mutate({ taskId, milestoneId, attach })
								}
							/>
							<TaskDetailDescription
								value={data.task.description}
								onUpdate={(patch) => taskOps.updateTask.mutate({ id: taskId, ...patch })}
							/>
							<TaskDetailComments
								comments={data.comments}
								onCreate={async (content) => {
									await commentOps.create.mutateAsync(content);
								}}
								onUpdate={async (id, content) => {
									await commentOps.update.mutateAsync({ id, content });
								}}
								onDelete={(commentId) => commentOps.remove.mutate(commentId)}
							/>
							<TaskDetailActivity activity={data.activity} projectName={data.projectName} />
						</div>
					</PageContent>
				)}
				<ConfirmDialog
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					title="永久删除任务"
					description={`确定永久删除任务"${data?.task.title ?? ""}"吗？此操作不可撤销。`}
					onConfirm={async () => {
						await taskOps.deleteTask.mutateAsync(taskId);
						navigate(`/w/${workspaceId}/p/${projectId}`);
					}}
				/>
			</div>
		</div>
	);
}
