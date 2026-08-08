// 任务详情页：描述编辑 / 评论 / 活动时间线（/w/:wid/p/:pid/t/:tid）。
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareIcon, SendIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useRealtime } from "@/hooks/use-realtime";
import { api } from "@/lib/api";
import type { Comment, TaskDetail } from "@/types/task-detail";
import type { Task } from "@/types/task";

const ACTION_LABELS: Record<string, string> = {
	"task.created": "创建了任务",
	"task.updated": "更新了任务",
	"task.moved": "移动了任务",
	"label.attached": "贴了标签",
	"label.detached": "移除了标签",
	"comment.created": "发表了评论",
};

function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function TaskDetailPage() {
	const { workspaceId = "", projectId = "", taskId = "" } = useParams();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [desc, setDesc] = useState("");
	const [editingTitle, setEditingTitle] = useState(false);
	const [editingDesc, setEditingDesc] = useState(false);
	const [comment, setComment] = useState("");

	const { data, isLoading, isError } = useQuery({
		queryKey: ["task", taskId],
		queryFn: () => api<TaskDetail>(`/api/tasks/${taskId}`),
		enabled: taskId !== "",
	});

	// 实时：项目事件推送后 invalidate 本页查询（含 board，返回看板时同步）。
	useRealtime(projectId);

	const invalidateTask = () =>
		queryClient.invalidateQueries({ queryKey: ["task", taskId] });

	const updateTaskMutation = useMutation({
		mutationFn: (patch: Partial<Pick<Task, "title" | "description">>) =>
			api<Task>(`/api/tasks/${taskId}`, {
				method: "PATCH",
				body: JSON.stringify(patch),
			}),
		onSuccess: invalidateTask,
	});

	const createCommentMutation = useMutation({
		mutationFn: (content: string) =>
			api<Comment>(`/api/tasks/${taskId}/comments`, {
				method: "POST",
				body: JSON.stringify({ content }),
			}),
		onSuccess: () => {
			setComment("");
			invalidateTask();
		},
	});

	const deleteCommentMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/comments/${id}`, { method: "DELETE" }),
		onSuccess: invalidateTask,
	});

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	if (isError || !data) {
		return (
			<p className="py-16 text-center text-sm text-destructive">
				加载任务详情失败
			</p>
		);
	}

	return (
		<div className="mx-auto max-w-3xl p-6">
			<Link
				to={`/w/${workspaceId}/p/${projectId}`}
				className="text-sm text-muted-foreground hover:text-foreground"
			>
				← 返回看板
			</Link>

			{/* 标题 */}
			<div className="mt-3 flex items-start gap-2">
				{editingTitle ? (
					<>
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="text-lg font-semibold"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && title.trim()) {
									updateTaskMutation.mutate({ title: title.trim() });
									setEditingTitle(false);
								}
								if (e.key === "Escape") setEditingTitle(false);
							}}
						/>
						<Button
							size="sm"
							disabled={!title.trim()}
							onClick={() => {
								updateTaskMutation.mutate({ title: title.trim() });
								setEditingTitle(false);
							}}
						>
							保存
						</Button>
					</>
				) : (
					<h1
						className="cursor-text text-xl font-semibold"
						onClick={() => {
							setTitle(data.task.title);
							setEditingTitle(true);
						}}
						title="点击编辑标题"
					>
						{data.task.title}
					</h1>
				)}
			</div>

			{/* 标签 */}
			{data.labels.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{data.labels.map((label) => (
						<span
							key={label.id}
							className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
							style={{ backgroundColor: label.color }}
						>
							{label.name}
						</span>
					))}
				</div>
			) : null}

			{/* 描述 */}
			<section className="mt-6">
				<h2 className="mb-2 text-sm font-medium text-muted-foreground">描述</h2>
				{editingDesc ? (
					<div className="space-y-2">
						<Textarea
							value={desc}
							onChange={(e) => setDesc(e.target.value)}
							rows={4}
							autoFocus
							placeholder="补充任务描述…"
						/>
						<div className="flex justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setEditingDesc(false)}
							>
								取消
							</Button>
							<Button
								size="sm"
								onClick={() => {
									updateTaskMutation.mutate({ description: desc });
									setEditingDesc(false);
								}}
							>
								保存
							</Button>
						</div>
					</div>
				) : (
					<div
						className="cursor-text rounded-md border border-dashed p-3 text-sm"
						onClick={() => {
							setDesc(data.task.description ?? "");
							setEditingDesc(true);
						}}
					>
						{data.task.description || (
							<span className="text-muted-foreground">添加描述…</span>
						)}
					</div>
				)}
			</section>

			{/* 评论 */}
			<section className="mt-8">
				<h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<MessageSquareIcon className="size-4" /> 评论（{data.comments.length}
					）
				</h2>
				<form
					className="mb-4 flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (comment.trim()) createCommentMutation.mutate(comment.trim());
					}}
				>
					<Input
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						placeholder="写评论…"
					/>
					<Button type="submit" size="icon" disabled={!comment.trim()}>
						<SendIcon />
					</Button>
				</form>
				{data.comments.length === 0 ? (
					<p className="text-xs text-muted-foreground">还没有评论</p>
				) : (
					<ul className="space-y-3">
						{data.comments.map((c) => (
							<li key={c.id} className="group rounded-md border bg-card p-3">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">
										{formatTime(c.createdAt)}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
										aria-label="删除评论"
										onClick={() => deleteCommentMutation.mutate(c.id)}
									>
										<TrashIcon />
									</Button>
								</div>
								<p className="mt-1 whitespace-pre-wrap text-sm">{c.content}</p>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* 活动 */}
			<section className="mt-8">
				<h2 className="mb-3 text-sm font-medium text-muted-foreground">活动</h2>
				{data.activity.length === 0 ? (
					<p className="text-xs text-muted-foreground">暂无活动</p>
				) : (
					<ol className="relative space-y-4 border-l pl-4">
						{data.activity.map((a) => (
							<li key={a.id} className="relative">
								<span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border" />
								<p className="text-sm">
									<span className="text-muted-foreground">Admin · </span>
									{ACTION_LABELS[a.action] ?? a.action}
								</p>
								<p className="text-xs text-muted-foreground">
									{formatTime(a.createdAt)}
								</p>
							</li>
						))}
					</ol>
				)}
			</section>
		</div>
	);
}
