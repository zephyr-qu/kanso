// 任务详情页：描述编辑 / 评论 / 活动时间线（/w/:wid/p/:pid/t/:tid）。
// 页面只负责数据查询、mutation 和抽屉编排，内容区域拆到 task-detail 模块中。
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmDialog from "@/components/confirm-dialog";
import { PageContent } from "@/components/kanso-ui";
import { Spinner } from "@/components/ui/spinner";
import { useRealtime } from "@/hooks/use-realtime";
import { invalidateTask, queryKeys } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import type { Milestone } from "@/types/board";
import type { Comment, TaskDetail } from "@/types/task-detail";
import type { Task } from "@/types/task";
import { TaskDetailActivity } from "@/components/task-detail/task-detail-activity";
import { TaskDetailComments } from "@/components/task-detail/task-detail-comments";
import { TaskDetailDescription } from "@/components/task-detail/task-detail-description";
import { TaskDetailHeader } from "@/components/task-detail/task-detail-header";
import { TaskDetailSummary } from "@/components/task-detail/task-detail-summary";

type TaskPatch = Partial<Pick<Task, "title" | "description" | "priority" | "dueDate">>;

export default function TaskDetailPage() {
	const { workspaceId = "", projectId = "", taskId = "" } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.task(taskId),
		queryFn: () => api<TaskDetail>(buildPath("task", { id: taskId })),
		enabled: taskId !== "",
	});

	// 实时：项目事件推送后 invalidate 本页查询（含 board，返回看板时同步）。
	useRealtime(projectId);
	// M5：任务归属里程碑（项目全部供选择，可多选）。
	const milestoneQuery = useQuery({
		queryKey: queryKeys.milestones(projectId),
		queryFn: () => api<Milestone[]>(buildPath("projectMilestones", { id: projectId })),
		enabled: projectId !== "",
	});
	const toggleMilestone = useMutation({
		meta: {
			feedback: { success: "里程碑关联已更新", errorTitle: "更新里程碑关联失败" },
		},
		mutationFn: ({ milestoneId, attach }: { milestoneId: string; attach: boolean }) =>
			api<void>(buildPath("taskMilestones", { taskId, milestoneId }), {
				method: attach ? "POST" : "DELETE",
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const updateTaskMutation = useMutation({
		meta: { feedback: { success: "任务已更新", errorTitle: "更新任务失败" } },
		mutationFn: (patch: TaskPatch) =>
			api<Task>(buildPath("task", { id: taskId }), {
				method: "PATCH",
				body: JSON.stringify(patch),
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const createCommentMutation = useMutation({
		meta: { feedback: { success: "评论已发布", errorTitle: "发表评论失败" } },
		mutationFn: (content: string) =>
			api<Comment>(buildPath("taskComments", { id: taskId }), {
				method: "POST",
				body: JSON.stringify({ content }),
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const deleteCommentMutation = useMutation({
		meta: { feedback: { success: "评论已删除", errorTitle: "删除评论失败" } },
		mutationFn: (id: string) => api<void>(buildPath("comment", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const archiveMutation = useMutation({
		meta: { feedback: { success: "任务状态已更新", errorTitle: "更新任务状态失败" } },
		mutationFn: (archived: boolean) =>
			api<Task>(buildPath(archived ? "taskArchive" : "taskRestore", { id: taskId }), {
				method: "POST",
			}),
		onSuccess: () => {
			invalidateTask(queryClient, taskId);
			queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
		},
	});

	const deleteMutation = useMutation({
		meta: { feedback: { success: "任务已删除", errorTitle: "删除任务失败" } },
		mutationFn: () => api<void>(buildPath("task", { id: taskId }), { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
			navigate(`/w/${workspaceId}/p/${projectId}`);
		},
	});

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
					taskId={taskId}
					data={data}
					onArchive={() => archiveMutation.mutate(!data?.task.archivedAt)}
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
								milestones={milestoneQuery.data}
								onUpdate={(patch) => updateTaskMutation.mutate(patch)}
								onToggleMilestone={(milestoneId, attach) =>
									toggleMilestone.mutate({ milestoneId, attach })
								}
							/>
							<TaskDetailDescription
								value={data.task.description}
								onUpdate={(patch) => updateTaskMutation.mutate(patch)}
							/>
			<TaskDetailComments
				comments={data.comments}
				onCreate={async (content) => {
					await createCommentMutation.mutateAsync(content);
				}}
								onDelete={(commentId) => deleteCommentMutation.mutate(commentId)}
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
						await deleteMutation.mutateAsync();
					}}
				/>
			</div>
		</div>
	);
}
