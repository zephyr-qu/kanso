// 任务详情页：描述编辑 / 评论 / 活动时间线（/w/:wid/p/:pid/t/:tid）。
// 借鉴原型 #detail：面包屑 + 大标题 + 白卡描述框 + 评论卡 + 圆点时间线。
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
import { invalidateTask, queryKeys } from "@/hooks/query-keys";
import { ACTION_LABELS } from "@/lib/events";
import type { Comment, TaskDetail } from "@/types/task-detail";
import type { Task } from "@/types/task";

// 相对时间：对齐原型 #detail（"今天 14:32 / 昨天 18:05 / M月D日 HH:mm"），
// 与仪表盘/活动页的相对格式保持一致。
function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const hhmm = date.toLocaleTimeString("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const now = new Date();
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const t = date.getTime();
	if (t >= startOfToday) return `今天 ${hhmm}`;
	if (t >= startOfToday - 86_400_000) return `昨天 ${hhmm}`;
	return `${date.getMonth() + 1}月${date.getDate()}日 ${hhmm}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
			{children}
		</h2>
	);
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
		queryKey: queryKeys.task(taskId),
		queryFn: () => api<TaskDetail>(`/api/tasks/${taskId}`),
		enabled: taskId !== "",
	});

	// 实时：项目事件推送后 invalidate 本页查询（含 board，返回看板时同步）。
	useRealtime(projectId);

	const updateTaskMutation = useMutation({
		mutationFn: (patch: Partial<Pick<Task, "title" | "description">>) =>
			api<Task>(`/api/tasks/${taskId}`, {
				method: "PATCH",
				body: JSON.stringify(patch),
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const createCommentMutation = useMutation({
		mutationFn: (content: string) =>
			api<Comment>(`/api/tasks/${taskId}/comments`, {
				method: "POST",
				body: JSON.stringify({ content }),
			}),
		onSuccess: () => {
			setComment("");
			invalidateTask(queryClient, taskId);
		},
	});

	const deleteCommentMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/comments/${id}`, { method: "DELETE" }),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	return (
		<div className="flex h-full flex-col">
			{/* 顶部 header：← 看板 / 项目名（对齐原型 #detail .top 与其他页面头部）。 */}
			<header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
				<div className="flex min-w-0 items-baseline gap-3">
					<Link
						to={`/w/${workspaceId}/p/${projectId}`}
						className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
					>
						← 看板
					</Link>
					<span className="text-muted-foreground/40">/</span>
					<h1 className="truncate text-[17px] font-[650] tracking-tight">
						{data?.projectName || "看板"}
					</h1>
				</div>
			</header>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : isError || !data ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载任务详情失败
				</p>
			) : (
				<div className="flex-1 overflow-auto px-12 py-8">

				{/* 标题（点击编辑） */}
				<div className="mt-1">
					{editingTitle ? (
						<div
							className="flex items-start gap-2"
							onBlur={(e) => {
								// 焦点移出编辑区（未点击内部按钮）时放弃编辑
								if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
									setEditingTitle(false);
								}
							}}
						>
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
						</div>
					) : (
						<h2
							className="cursor-text text-2xl font-[650] tracking-tight"
							onClick={() => {
								setTitle(data.task.title);
								setEditingTitle(true);
							}}
							title="点击编辑标题"
						>
							{data.task.title}
						</h2>
					)}
				</div>

				{/* 标签：小圆点 + 名称 */}
				{data.labels.length > 0 ? (
					<div className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5">
						{data.labels.map((label) => (
							<span
								key={label.id}
								className="inline-flex items-center gap-[5px] text-xs text-muted-foreground"
							>
								<span
									className="size-2 rounded-full"
									style={{ backgroundColor: label.color }}
								/>
								{label.name}
							</span>
						))}
					</div>
				) : null}

				{/* 描述 */}
				<section className="mt-8">
					<SectionLabel>描述</SectionLabel>
					{editingDesc ? (
						<div
							className="space-y-2"
							onBlur={(e) => {
								// 焦点移出编辑区（未点击内部按钮）时放弃编辑
								if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
									setEditingDesc(false);
								}
							}}
						>
							<Textarea
								value={desc}
								onChange={(e) => setDesc(e.target.value)}
								rows={4}
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Escape") setEditingDesc(false);
								}}
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
							className="cursor-text rounded-[10px] border bg-card p-4 text-sm leading-[1.7] text-[#4b5563] transition-colors hover:border-[rgba(24,24,27,0.14)]"
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
					<SectionLabel>评论（{data.comments.length}）</SectionLabel>
					<form
						className="mb-[14px] flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							if (comment.trim()) createCommentMutation.mutate(comment.trim());
						}}
					>
						<Input
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="写评论…"
							className="h-[38px] sm:h-[38px]"
						/>
						<Button type="submit" size="icon" disabled={!comment.trim()}>
							<SendIcon />
						</Button>
					</form>
					{data.comments.length === 0 ? (
						<p className="text-xs text-muted-foreground">还没有评论</p>
					) : (
						<ul className="space-y-2.5">
							{data.comments.map((c) => (
								<li
									key={c.id}
									className="group flex items-start gap-2 rounded-[10px] border bg-card px-3.5 py-3"
								>
									{/* 对齐原型 .comment：cm-meta(12px/mb 4px) + cm-body(14px/1.6 无 margin)。
										删除按钮固定整卡右侧（hover 显示），不遮挡评论内容。 */}
									<div className="min-w-0 flex-1">
										<p className="mb-1 text-xs text-muted-foreground/70">
											Admin · {formatTime(c.createdAt)}
										</p>
										<p className="whitespace-pre-wrap text-sm leading-[1.6]">
											{c.content}
										</p>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 shrink-0 rounded-[6px] opacity-0 transition-opacity group-hover:opacity-100"
										aria-label="删除评论"
										onClick={() => deleteCommentMutation.mutate(c.id)}
									>
										<TrashIcon />
									</Button>
								</li>
							))}
						</ul>
					)}
				</section>

				{/* 活动时间线 */}
				<section className="mt-8">
					<SectionLabel>活动</SectionLabel>
					{data.activity.length === 0 ? (
						<p className="text-xs text-muted-foreground">暂无活动</p>
					) : (
						<ol className="relative ml-1.5 space-y-3.5 border-l pl-5">
							{data.activity.map((a, i) => (
								<li key={a.id} className="relative">
									<span
										className={`absolute -left-6 top-[5px] size-[7px] rounded-full ${
											i === 0 ? "bg-primary" : "bg-[#d1d5db]"
										}`}
									/>
									{/* 原型 .a-text：13px / #4b5563；b 加粗 #18181b。 */}
									<p className="text-[13px] leading-[1.5] text-[#4b5563]">
										<span className="font-medium text-foreground">Admin · </span>
										{ACTION_LABELS[a.action] ?? a.action}
									</p>
									{/* 原型 .a-time：12px / #9ca3af。 */}
									<p className="mt-0.5 text-xs text-muted-foreground/70">
										{formatTime(a.createdAt)}
									</p>
								</li>
							))}
						</ol>
					)}
				</section>
					</div>
				)}
			</div>
		);
	}
