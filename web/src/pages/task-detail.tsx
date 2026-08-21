// 任务详情页：描述编辑 / 评论 / 活动时间线（/w/:wid/p/:pid/t/:tid）。
// 借鉴原型 #detail：面包屑 + 大标题 + 白卡描述框 + 评论卡 + 圆点时间线。
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CalendarIcon,
	ArchiveIcon,
	ArchiveRestoreIcon,
	FlagIcon,
	MessageSquareIcon,
	MilestoneIcon,
	SendIcon,
	TagIcon,
	Trash2Icon,
	TrashIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useRealtime } from "@/hooks/use-realtime";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateTask, queryKeys } from "@/hooks/query-keys";
import { ACTION_LABELS } from "@/lib/events";
import { activityDetail } from "@/lib/activity";
import { formatDateTime } from "@/lib/format-relative";
import { dueState } from "@/lib/due";
import { PageContent, PageHeader } from "@/components/kanso-ui";
import DatePicker from "@/components/date-picker";
import {
	normalizePriority,
	PRIORITY_LABEL,
	priorityColor,
} from "@/lib/priority";
import { PriorityPicker } from "@/components/priority-picker";
import type { Comment, TaskDetail } from "@/types/task-detail";
import type { Milestone } from "@/types/board";
import type { Task } from "@/types/task";

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <h2 className="kanso-detail-section-title">{children}</h2>;
}

function DescriptionContent({ value }: { value: string | null }) {
	const paragraphs = value?.trim()
		? value.split(/\n\s*\n/)
		: ["暂无描述，点击编辑添加。"];

	return (
		<div className="kanso-task-detail__description">
			{paragraphs.map((paragraph, index) => {
				const lines = paragraph.split("\n");
				return (
					<div key={`${index}-${paragraph.slice(0, 12)}`}>
						{lines.map((line, lineIndex) => {
							const isBullet = line.startsWith("• ");
							return (
								<p
									key={`${lineIndex}-${line}`}
									className={
										isBullet ? "kanso-task-detail__description-bullet" : undefined
									}
								>
									{isBullet ? line.slice(2) : line}
								</p>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

export default function TaskDetailPage() {
	const { workspaceId = "", projectId = "", taskId = "" } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [desc, setDesc] = useState("");
	const [editingTitle, setEditingTitle] = useState(false);
	const [editingDesc, setEditingDesc] = useState(false);
	const [comment, setComment] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.task(taskId),
		queryFn: () => api<TaskDetail>(buildPath("task", { id: taskId })),
		enabled: taskId !== "",
	});

	// 实时：项目事件推送后 invalidate 本页查询（含 board，返回看板时同步）。
	useRealtime(projectId);
	// M5:任务归属里程碑(项目全部供选择,可多选)。
	const milestoneQuery = useQuery({
		queryKey: queryKeys.milestones(projectId),
		queryFn: () => api<Milestone[]>(buildPath("projectMilestones", { id: projectId })),
		enabled: projectId !== "",
	});
	const toggleMilestone = useMutation({
		meta: { feedback: { success: "里程碑关联已更新", errorTitle: "更新里程碑关联失败" } },
		mutationFn: ({ milestoneId, attach }: { milestoneId: string; attach: boolean }) =>
			api<void>(buildPath("taskMilestones", { taskId, milestoneId }), { method: attach ? "POST" : "DELETE" }),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const updateTaskMutation = useMutation({
		meta: { feedback: { success: "任务已更新", errorTitle: "更新任务失败" } },
		mutationFn: (
			patch: Partial<Pick<Task, "title" | "description" | "priority" | "dueDate">>,
		) =>
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
		onSuccess: () => {
			setComment("");
			invalidateTask(queryClient, taskId);
		},
	});

	const deleteCommentMutation = useMutation({
		meta: { feedback: { success: "评论已删除", errorTitle: "删除评论失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("comment", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});
	const archiveMutation = useMutation({
		meta: { feedback: { success: "任务状态已更新", errorTitle: "更新任务状态失败" } },
		mutationFn: (archived: boolean) =>
			api<Task>(
				buildPath(archived ? "taskArchive" : "taskRestore", { id: taskId }),
				{ method: "POST" },
			),
		onSuccess: () => {
			invalidateTask(queryClient, taskId);
			queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
		},
	});
	const deleteMutation = useMutation({
		meta: { feedback: { success: "任务已删除", errorTitle: "删除任务失败" } },
		mutationFn: () =>
			api<void>(buildPath("task", { id: taskId }), { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
			navigate(`/w/${workspaceId}/p/${projectId}`);
		},
	});

	return (
		<div className="flex h-full flex-col">
			{/* 顶部 header：← 看板 / 项目名（对齐原型 #detail .top 与其他页面头部）。 */}
			<PageHeader>
				<div className="kanso-task-detail__breadcrumb">
					<Link
						to={`/w/${workspaceId}/p/${projectId}`}
						className="kanso-task-detail__breadcrumb-project kanso-task-detail__breadcrumb-link"
					>
						{data?.projectName || "看板"}
					</Link>
					<span className="kanso-task-detail__breadcrumb-separator">/</span>
					<h1 className="kanso-task-detail__breadcrumb-task">
						{data?.task.title || "任务详情"}
					</h1>
					{data?.task.archivedAt ? <span className="kanso-chip">已归档</span> : null}
				</div>
				{data ? (
					<div className="kanso-task-detail__header-right">
						<span className="kanso-task-detail__task-id">
							TASK · {taskId.toUpperCase()}
						</span>
						<div className="kanso-task-detail__header-actions">
							<Button
								variant="ghost"
								size="icon"
								className="kanso-icon-button"
								aria-label={data.task.archivedAt ? "恢复任务" : "归档任务"}
								onClick={() => archiveMutation.mutate(!data.task.archivedAt)}
							>
								{data.task.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
							</Button>
							{data.task.archivedAt ? (
								<Button
									variant="ghost"
									size="icon"
									className="kanso-icon-button"
									data-danger="true"
									aria-label="永久删除任务"
									onClick={() => setDeleteOpen(true)}
								>
									<Trash2Icon />
								</Button>
							) : null}
						</div>
					</div>
				) : null}
			</PageHeader>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : isError || !data ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载任务详情失败
				</p>
			) : (
				<PageContent className="kanso-task-detail px-[30px] pb-11 pt-[26px]">
					<div className="kanso-task-detail__wrap">
						{/* 标题（点击编辑） */}
						<div className="kanso-task-detail__title-row">
							<div className="min-w-0 flex-1">
								{editingTitle ? (
									<div
										className="flex items-start gap-2"
										onBlur={(e) => {
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
										className="kanso-task-detail__title cursor-text"
										onClick={() => {
											setTitle(data.task.title);
											setEditingTitle(true);
										}}
										title="点击编辑标题"
									>
										{data.task.title}
									</h2>
								)}
								<div className="kanso-task-detail__title-meta">
									{/* 优先级：单标记，点击弹四档选择器（选中即保存）。 */}
									<Popover>
										<PopoverTrigger
											render={
												<button
													type="button"
													className="kanso-task-detail__priority cursor-pointer"
													title="修改优先级"
												>
													<span
														className="kanso-priority__dot"
														style={{
															backgroundColor: priorityColor(normalizePriority(data.task.priority)),
														}}
													/>
													{PRIORITY_LABEL[normalizePriority(data.task.priority)]}
												</button>
											}
										/>
										<PopoverPopup className="w-fit p-2">
										<PriorityPicker
											value={normalizePriority(data.task.priority)}
											onChange={(p) => updateTaskMutation.mutate({ priority: p })}
											titlePrefix="设为"
											size="px-1.5 py-0.5 text-[11px]"
										/>
										</PopoverPopup>
									</Popover>
									{data.labels.map((label) => (
										<span key={label.id} className="kanso-task-detail__label-chip">
											{label.name}
										</span>
									))}
								</div>
							</div>
						</div>

						{/* 元数据条（原型 d-meta-row）：截止日期 / 评论 / 标签 / 状态列名 */}
						<div className="kanso-task-detail__meta">
							<div className="kanso-detail-meta-item">
								<CalendarIcon className="size-3.5 opacity-70" />
								截止
								<DatePicker
									value={data.task.dueDate ?? ""}
									onChange={(v) => updateTaskMutation.mutate({ dueDate: v })}
									ariaLabel="截止日期"
									showIcon={false}
									placeholder="设置日期"
								/>
								{dueState(data.task.dueDate) === "soon" ? (
									<span className="kanso-due-badge">临期</span>
								) : null}
							</div>
							<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
								<MessageSquareIcon className="size-3.5 opacity-70" />
								评论{" "}
								<strong className="font-semibold text-foreground">
									{data.comments.length}
								</strong>
							</span>
							<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
								<TagIcon className="size-3.5 opacity-70" />
								标签{" "}
								<strong className="font-semibold text-foreground">
									{data.labels.length}
								</strong>
							</span>
							<Popover>
								<PopoverTrigger
									render={
										<button type="button" className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
											<MilestoneIcon className="size-3.5 opacity-70" />
											里程碑 <strong className="font-semibold text-foreground">{(data.milestones ?? []).length}</strong>
										</button>
								}
								/>
								<PopoverPopup className="w-56 p-2">
									<p className="px-1 pb-1 text-xs text-muted-foreground">里程碑</p>
									{milestoneQuery.data && milestoneQuery.data.length > 0 ? (
										<ul className="space-y-0.5">
											{milestoneQuery.data.map((m) => {
												const attached = (data.milestones ?? []).some((x) => x.id === m.id);
												return (
													<li key={m.id}>
														<button type="button" className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
															onClick={() => toggleMilestone.mutate({ milestoneId: m.id, attach: !attached })}>
															<span className="flex-1">{m.name}</span>
															{attached ? <span className="text-primary">✓</span> : null}
														</button>
													</li>
												);
											})}
										</ul>
									) : (
										<p className="px-1 py-2 text-xs text-muted-foreground">暂无里程碑，可在项目看板创建</p>
									)}
								</PopoverPopup>
							</Popover>
							<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
								<FlagIcon className="size-3.5 opacity-70" />
								状态{" "}
								<strong className="font-semibold text-foreground">
									{data.columnName || "未设列"}
								</strong>
							</span>
						</div>

						{/* 描述 */}
						<section className="kanso-task-detail__section">
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
											保存描述
										</Button>
									</div>
								</div>
							) : (
								<div
									className="cursor-text rounded-[10px] border bg-card p-4 text-sm leading-[1.7] text-muted-foreground transition-colors hover:border-foreground/15"
									onClick={() => {
										setDesc(data.task.description ?? "");
										setEditingDesc(true);
									}}
								>
									<DescriptionContent value={data.task.description} />
								</div>
							)}
						</section>

						{/* 评论 */}
						<section className="kanso-task-detail__section">
							<SectionLabel>评论</SectionLabel>
							<form
								className="kanso-comment-composer"
								onSubmit={(e) => {
									e.preventDefault();
									if (comment.trim()) createCommentMutation.mutate(comment.trim());
								}}
							>
								<Textarea
									value={comment}
									onChange={(e) => setComment(e.target.value)}
									placeholder="写下评论…"
									className="kanso-comment-input"
									unstyled
									rows={3}
								/>
								<div className="kanso-comment-composer__actions">
									<Button type="submit" size="sm" disabled={!comment.trim()}>
										<SendIcon /> 发表评论
									</Button>
								</div>
							</form>
							{data.comments.length === 0 ? (
								<p className="text-xs text-muted-foreground">还没有评论</p>
							) : (
								<ul className="kanso-comment-list">
									{data.comments.map((c) => (
										<li key={c.id} className="kanso-comment">
											<span className="kanso-comment__avatar">Ad</span>
											<div className="kanso-comment__body">
												<div className="kanso-comment__head">
													<span className="font-semibold">{c.author || "—"}</span>
													<span>{formatDateTime(c.createdAt)}</span>
													<Button
														variant="ghost"
														size="icon"
														className="kanso-comment__delete"
														aria-label="删除评论"
														onClick={() => deleteCommentMutation.mutate(c.id)}
													>
														<TrashIcon />
													</Button>
												</div>
												<div className="kanso-comment__text">{c.content}</div>
											</div>
										</li>
									))}
								</ul>
							)}
						</section>

						{/* 活动时间线 */}
						<section className="kanso-task-detail__section">
							<SectionLabel>活动记录</SectionLabel>
							{data.activity.length === 0 ? (
								<p className="text-xs text-muted-foreground">暂无活动</p>
							) : (
								<ol className="kanso-detail-timeline">
									{data.activity.map((a, i) => (
										<li key={a.id} className="kanso-detail-timeline__item">
											<span
												className={`kanso-detail-timeline__dot ${i === 0 ? "is-current" : ""}`}
											/>
											<div className="kanso-detail-timeline__body">
												<div className="kanso-detail-timeline__text">
													<span>在 </span>
													<strong>{a.projectName || data.projectName || "—"}</strong>
													<span>
														{" "}
														中，{a.actor || "—"} {ACTION_LABELS[a.action] ?? a.action}
														{activityDetail(a.action, a.data)}
													</span>
												</div>
												<div className="kanso-detail-timeline__time">
													{formatDateTime(a.createdAt)}
												</div>
											</div>
										</li>
									))}
								</ol>
							)}
						</section>
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
	);
}
