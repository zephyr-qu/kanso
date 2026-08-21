// 看板页：编排与渲染。数据/缓存/乐观更新逻辑都在领域 hooks 里（架构候选 1）。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type Announcements,
} from "@dnd-kit/core";
import {
	SortableContext,
	horizontalListSortingStrategy,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ArchiveIcon, MilestoneIcon, PencilIcon, Share2Icon, TrashIcon } from "lucide-react";
import DatePicker from "@/components/date-picker";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, useParams } from "react-router";
import ConfirmDialog from "@/components/confirm-dialog";
import LabelManagerDialog from "@/components/label-manager";
import NameDialog from "@/components/name-dialog";
import ShareMilestoneDialog from "@/components/share-milestone-dialog";
import MilestoneDetailDialog from "@/components/milestone-detail-dialog";
import SortableColumn from "@/components/board/sortable-column";
import { TaskCardView } from "@/components/board/sortable-task-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBackdrop, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { recordProjectOpen } from "@/lib/recent-projects";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { sortTasks } from "@/lib/sort-tasks";
import { progressPct } from "@/lib/milestone-progress";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useBoardData } from "@/hooks/use-board-data";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useLabelMutations } from "@/hooks/use-label-mutations";
import { useMilestoneMutations } from "@/hooks/use-milestone-mutations";
import { useMilestoneLink } from "@/hooks/use-milestone-link";
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { useBoardDrag, swimlaneGroups } from "@/hooks/use-board-drag";
import { boardCollisionDetection, overSignal } from "@/lib/board-dnd";
import { SwimlaneRow } from "@/components/board/swimlane-row";
import type { Board, BoardColumn, Milestone } from "@/types/board";
import type { Task } from "@/types/task";
import type { Workspace } from "@/types/workspace";
import { PageContent } from "@/components/kanso-ui";
import { BoardToolbar } from "@/components/board/board-toolbar";

export default function BoardPage() {
	const { projectId = "", workspaceId = "" } = useParams();

	// 打开项目即记录"最近打开"，供仪表盘"项目速览"展示。
	useEffect(() => {
		if (workspaceId && projectId) recordProjectOpen(workspaceId, projectId);
	}, [workspaceId, projectId]);
	const navigate = useNavigate();
	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});
	const workspaceName =
		workspaces?.find((workspace) => workspace.id === workspaceId)?.name ?? "工作区";

	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<BoardColumn | null>(null);
	const [deleting, setDeleting] = useState<BoardColumn | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [labelManagerOpen, setLabelManagerOpen] = useState(false);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"columns" | "swimlane">("columns");
	const [milestoneOpen, setMilestoneOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [detailMilestone, setDetailMilestone] = useState<Milestone | null>(null);
	const [newMilestone, setNewMilestone] = useState("");
	// 里程碑行内编辑/删除状态。
	const [editingMilestone, setEditingMilestone] = useState<{ id: string; name: string } | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);
	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	// 显示层排序（按项目持久化到 localStorage，刷新保持）：不改写 position。
	const { sort: sortConfig, setSort: setSortConfig } = useBoardSort(projectId);
	const { board, isLoading, isError, columnOps } = useBoardData(projectId);
	const taskOps = useTaskMutations(projectId);
	const labelOps = useLabelMutations(projectId);
	// 拖拽状态机（useBoardDrag）：视觉状态 + dragend 提交计划，纯函数在 hooks/use-board-drag.ts。
	const { dragState, activeTask, dragActiveTaskId, activeTaskColumnId, onDragStart, onDragOver, onDragEnd, onDragCancel } =
		useBoardDrag(board, viewMode);
	const archivedQuery = useQuery({
		queryKey: queryKeys.archivedTasks(projectId),
		queryFn: () => api<Task[]>(buildPath("projectArchivedTasks", { id: projectId })),
		enabled: archiveOpen && projectId !== "",
	});
	const milestonesQuery = useQuery({
		queryKey: queryKeys.milestones(projectId),
		queryFn: () => api<Milestone[]>(buildPath("projectMilestones", { id: projectId })),
		enabled: projectId !== "",
	});
	// 里程碑所有操作收敛到领域 hook（建/改名/设截止/删除/关联，成功统一失效列表）。
	const milestoneOps = useMilestoneMutations(projectId);
	const { milestoneLink, startMilestoneLink, clearLinkPress, suppressClickRef } = useMilestoneLink(
		(taskId, milestoneId) => milestoneOps.attach.mutate({ taskId, milestoneId }),
	);

	// 实时：其他窗口的写操作经 WS 推送后 invalidate 本页查询。
	useRealtime(projectId, { deferInvalidation: dragState.activeId !== null });

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			// Space 开始键盘拖拽；Enter 留给任务卡根节点打开详情（卡片同时是拖拽激活面）。
			keyboardCodes: {
				start: ["Space"],
			cancel: ["Escape"],
				end: ["Space", "Enter", "Tab"],
			},
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// dragend：状态机产出提交计划，这里只做 命令 → mutation 的映射（列/任务/标签各归其 hook）。
	function handleDragEnd(event: DragEndEvent) {
		const { overId, overType, halfPassed } = overSignal(event);
		const commands = onDragEnd(String(event.active.id), overId, overType, halfPassed);
		for (const command of commands) {
			if (command.type === "moveTask") {
				taskOps.moveTask.mutate({ id: command.id, columnId: command.columnId, position: command.position });
			} else if (command.type === "moveColumn") {
				columnOps.moveColumn.mutate({ id: command.id, position: command.position });
			} else if (command.type === "toggleLabel") {
				labelOps.toggleLabel.mutate({ taskId: command.taskId, labelId: command.labelId, attach: command.attach });
			}
		}
	}
	const announcements: Announcements = {
		onDragStart: ({ active }) => {
			const task = board?.columns.flatMap((column) => column.tasks).find((item) => item.id === String(active.id));
			const column = board?.columns.find((item) => item.id === String(active.id));
			return task ? `已抓取任务「${task.title}」，按方向键移动，按空格放下，按 Escape 取消。` : column ? `已抓取列「${column.name}」，按左右方向键移动，按空格放下，按 Escape 取消。` : "已开始拖拽。";
		},
		onDragOver: ({ active, over }) => {
			if (!over) return "已离开放置区域。";
			const targetColumn = board?.columns.find((column) =>
				column.id === String(over.id) || column.tasks.some((task) => task.id === String(over.id)),
			);
			const task = board?.columns.flatMap((column) => column.tasks).find((item) => item.id === String(active.id));
			return targetColumn ? `任务「${task?.title ?? String(active.id)}」已移动到「${targetColumn.name}」。` : `已移动到「${String(over.id)}」。`;
		},
		onDragEnd: ({ active, over }) => {
			if (!over) return "拖拽已结束，未改变位置。";
			const targetColumn = board?.columns.find((column) =>
				column.id === String(over.id) || column.tasks.some((task) => task.id === String(over.id)),
			);
			const task = board?.columns.flatMap((column) => column.tasks).find((item) => item.id === String(active.id));
			return targetColumn ? `任务「${task?.title ?? String(active.id)}」已放入「${targetColumn.name}」。` : "拖拽已完成。";
		},
		onDragCancel: () => "拖拽已取消，任务位置未改变。",
	};
	return (
		<div className="flex h-full flex-col">
			<BoardToolbar
				board={board}
				workspaceName={workspaceName}
				projectId={projectId}
				sortConfig={sortConfig}
				setSortConfig={setSortConfig}
				viewMode={viewMode}
				setViewMode={setViewMode}
				setCreateOpen={setCreateOpen}
				setLabelManagerOpen={setLabelManagerOpen}
				setArchiveOpen={setArchiveOpen}
				setMilestoneOpen={setMilestoneOpen}
			/>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : isError ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载看板失败
				</p>
			) : board && board.columns.length > 0 ? (
				<PageContent className="kanso-board-content overflow-auto px-[26px] pb-7 pt-5">
{/* M2 项目页里程碑进度卡(常驻概览,点击进管理);无里程碑给空态。 */}
{milestonesQuery.data && milestonesQuery.data.length > 0 ? (
						<div className="mb-3">
							<div className="mb-1.5 flex items-center justify-between">
								<span className="text-xs font-medium text-muted-foreground">里程碑进度</span>
									<button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShareOpen(true)}>分享进度</button>
							</div>
							<div className="flex flex-wrap gap-2">
								{milestonesQuery.data.map((m) => {
									const pct = progressPct(m);
									return (
										<div key={m.id} role="button" tabIndex={0}
											onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } setDetailMilestone(m); }}
											onPointerDown={(e) => startMilestoneLink(e, m.id)}
											onPointerUp={clearLinkPress}
											onKeyDown={(e) => { if (e.key === "Enter") setDetailMilestone(m); }}
											className="kanso-surface-card group relative flex w-40 flex-col gap-1 p-3 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring">
											<MilestoneDeleteButton
												milestone={m}
												onDelete={(mm) => { void milestoneOps.remove.mutateAsync(mm.id); }}
												className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
											/>
											<span className="pr-4 truncate text-sm font-medium">{m.name}</span>
											<span className="text-[11px] text-muted-foreground">{m.dueDate ? `截止 ${m.dueDate}` : "未设截止"}</span>
											<span className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
											<span className="text-[11px] text-muted-foreground">{pct}% 完成</span>
										</div>
									);
								})}
							</div>
						</div>
) : milestonesQuery.data ? (
						<div className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
							暂无里程碑，点击右上角「里程碑」创建。
						</div>
) : null}
					<DndContext
						accessibility={{
							announcements,
							screenReaderInstructions: {
								draggable: "按空格或 Enter 抓取。使用方向键移动，按空格或 Enter 放下，按 Escape 取消。",
							},
						}}
						sensors={sensors}
						collisionDetection={boardCollisionDetection}
						onDragStart={(event) => onDragStart(String(event.active.id))}
						onDragEnd={handleDragEnd}
						onDragOver={(event) => {
							const { overId, overType, halfPassed } = overSignal(event);
							onDragOver(String(event.active.id), overId, overType, halfPassed);
						}}
						onDragCancel={onDragCancel}
					>
						<SortableContext
							items={board.columns.map((c) => c.id)}
							strategy={horizontalListSortingStrategy}
						>
							{viewMode === "columns" ? <div className="kanso-board-row flex items-start">
							{board.columns.map((column) => (
									<SortableColumn
										key={column.id}
									column={column}
									dragOver={dragState.dragOverId === column.id}
										dragActiveTaskId={dragActiveTaskId}
										activeTaskColumnId={activeTaskColumnId}
								dragPos={dragState.dragPos}
										draggedTask={activeTask}
										labels={board.labels}
										sortConfig={sortConfig}
										onRename={setRenaming}
										onDelete={setDeleting}
										onAddTask={(columnId, title, priority) =>
											taskOps.createTask.mutate({ columnId, title, priority })
										}
										onOpenTask={(task) =>
											navigate(
												`/w/${board?.project.workspaceId ?? ""}/p/${projectId}/t/${task.id}`,
											)
										}
										onArchiveTask={(task) => taskOps.setArchived.mutate({ id: task.id, archived: true })}
										onToggleLabel={(task, label) =>
											labelOps.toggleLabel.mutate({
												taskId: task.id,
												labelId: label.id,
												attach: !(task.labels ?? []).some((item) => item.id === label.id),
											})
										}
									/>
								))}
							</div> : <div className="kanso-swimlanes">{swimlaneGroups(board).map((group) => <SwimlaneRow key={group.id} group={group} columns={board.columns} onOpen={task => navigate(`/w/${board.project.workspaceId}/p/${projectId}/t/${task.id}`)} onEdit={setEditingTask} onArchive={task => taskOps.setArchived.mutate({ id: task.id, archived: true })} />)}</div>}
							</SortableContext>
						{/* 拖拽副本：任务卡跟随光标（overlay 默认 drop 动画平滑归位）；列拖拽走原 transform 方式。 */}
						{viewMode === "columns" && activeTask ? (
							<DragOverlay
								className="kanso-drag-overlay"
								dropAnimation={reducedMotion ? null : {
									duration: 180,
									easing: "cubic-bezier(0.2, 0, 0, 1)",
								}}
							>
								<div
									className="pointer-events-none"
									// 282 列宽 - 10*2 body padding - 1*2 列边框，与列内卡片同宽。
									style={{ width: 260 }}
								>
									<TaskCardView task={activeTask} labels={board.labels} />
								</div>
							</DragOverlay>
						) : null}
						</DndContext>
				</PageContent>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>看板还没有列</EmptyTitle>
						<EmptyDescription>
							点击右上角"新建列"开始组织你的工作流。
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			<NameDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="新建列"
				description="新列将追加到看板末尾。"
				submitLabel="创建"
				onSubmit={async (name) => {
					await columnOps.createColumn.mutateAsync(name);
				}}
			/>
			<NameDialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
				title="重命名列"
				description="修改列名称。"
				submitLabel="保存"
				initialValue={renaming?.name ?? ""}
				onSubmit={async (name) => {
					if (renaming)
						await columnOps.renameColumn.mutateAsync({ id: renaming.id, name });
				}}
			/>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="删除列"
				description={`确定删除列"${deleting?.name ?? ""}"吗？其下任务将一并删除，此操作不可撤销。`}
				onConfirm={async () => {
					if (deleting) await columnOps.deleteColumn.mutateAsync(deleting.id);
				}}
			/>
			<NameDialog
				open={editingTask !== null}
				onOpenChange={(open) => {
					if (!open) setEditingTask(null);
				}}
				title="编辑任务"
				description="修改任务标题。"
				submitLabel="保存"
				initialValue={editingTask?.title ?? ""}
				onSubmit={async (name) => {
					if (editingTask)
						await taskOps.updateTask.mutateAsync({
							id: editingTask.id,
							title: name,
						});
				}}
			/>
			<LabelManagerDialog
				open={labelManagerOpen}
				onOpenChange={setLabelManagerOpen}
				labels={board?.labels ?? []}
				onCreate={async (name) => {
					await labelOps.createLabel.mutateAsync({ name });
				}}
				onRename={async (id, name) => {
					await labelOps.renameLabel.mutateAsync({ id, name });
				}}
				onDelete={async (id) => {
					await labelOps.deleteLabel.mutateAsync(id);
				}}
			/>
			<Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
				<DialogPortal>
					<DialogBackdrop />
					<DialogPopup>
						<DialogHeader>
							<DialogTitle>归档任务</DialogTitle>
							<DialogDescription>归档任务从看板隐藏，但仍可搜索和恢复。</DialogDescription>
						</DialogHeader>
						<DialogPanel>
							{archivedQuery.isLoading ? <p className="kanso-loading py-8 text-center text-xs">加载归档任务…</p> : null}
							{archivedQuery.isError ? <p className="kanso-error py-8 text-center text-xs">加载归档任务失败</p> : null}
							{!archivedQuery.isLoading && !archivedQuery.isError && (archivedQuery.data?.length ?? 0) === 0 ? <div className="kanso-empty-state min-h-24 text-xs">暂无归档任务</div> : null}
							<ul className="space-y-2">
								{archivedQuery.data?.map((task) => (
									<li key={task.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
										<ArchiveIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
																		<div className="flex items-center gap-2">
																			<Button size="sm" variant="outline" onClick={() => taskOps.setArchived.mutate({ id: task.id, archived: false }, { onSuccess: () => void archivedQuery.refetch() })}>恢复</Button>
																			<ArchiveDeleteButton task={task} onDelete={(t) => taskOps.deleteTask.mutate(t.id, { onSuccess: () => void archivedQuery.refetch() })} />
																		</div>
									</li>
								))}
							</ul>
						</DialogPanel>
					</DialogPopup>
				</DialogPortal>
			</Dialog>
			<Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
				<DialogPortal><DialogBackdrop /><DialogPopup>
					<DialogHeader><DialogTitle>里程碑</DialogTitle><DialogDescription>项目阶段节点 · 进度按任务位置推导</DialogDescription></DialogHeader>
					<DialogPanel>
						<form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (newMilestone.trim()) { void milestoneOps.create.mutateAsync(newMilestone.trim()); setNewMilestone(""); } }}>
							<input className="kanso-input min-w-0 flex-1 rounded-md border px-3 text-sm" value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="新里程碑名称" />
							<Button type="submit">创建</Button>
						</form>
						<div className="space-y-2">
								{milestonesQuery.data?.map((milestone) => {
									const pct = progressPct(milestone);
									const editing = editingMilestone?.id === milestone.id;
									return (
										<div key={milestone.id} className="group flex items-center gap-2.5 rounded-md border border-border px-3 py-2">
											{editing ? (
												<input
													autoFocus
													defaultValue={milestone.name}
													aria-label="重命名里程碑"
													className="kanso-input min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
													onKeyDown={(e) => {
														if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim())
														void milestoneOps.rename.mutateAsync({ id: milestone.id, name: (e.target as HTMLInputElement).value.trim() }).then(() => setEditingMilestone(null));
														if (e.key === "Escape") setEditingMilestone(null);
													}}
													onBlur={(e) => {
														if (e.target.value.trim() && e.target.value.trim() !== milestone.name)
														void milestoneOps.rename.mutateAsync({ id: milestone.id, name: e.target.value.trim() }).then(() => setEditingMilestone(null));
														else setEditingMilestone(null);
													}}
												/>
											) : (
												<span className="min-w-0 flex-1 truncate text-sm">{milestone.name}</span>
											)}
											<span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
											<span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{milestone.progress ? `${pct}%` : "—"}</span>
														<DatePicker
															value={milestone.dueDate ?? ""}
													onChange={(d) => void milestoneOps.updateDueDate.mutateAsync({ id: milestone.id, dueDate: d })}
															ariaLabel="里程碑截止日期"
															placeholder="设置日期"
														/>
											<button type="button" aria-label={`重命名 ${milestone.name}`} title="重命名" className="text-muted-foreground hover:text-foreground" onClick={() => setEditingMilestone({ id: milestone.id, name: milestone.name })}><PencilIcon className="size-3.5" /></button>
										<MilestoneDeleteButton milestone={milestone} onDelete={(mm) => { void milestoneOps.remove.mutateAsync(mm.id); }} className="text-muted-foreground hover:text-destructive" />
										</div>
									);
								})}
						</div>
					
					</DialogPanel>
				</DialogPopup></DialogPortal>
			</Dialog>
		
			{milestoneLink ? createPortal(
				<svg className="pointer-events-none fixed left-0 top-0 z-[120] h-screen w-screen">
					<line x1={milestoneLink.fromX} y1={milestoneLink.fromY} x2={milestoneLink.curX} y2={milestoneLink.curY} stroke="#c2410c" strokeWidth={2} strokeDasharray="5 4" />
					<circle cx={milestoneLink.curX} cy={milestoneLink.curY} r={5} fill={milestoneLink.targetTaskId ? "#c2410c" : "rgba(194,65,12,.45)"} />
				</svg>
, document.body) : null}
			<ShareMilestoneDialog open={shareOpen} onOpenChange={setShareOpen} projectName={board?.project.name ?? ""} milestones={milestonesQuery.data ?? []} />
			<MilestoneDetailDialog
				open={detailMilestone !== null}
				onOpenChange={(open) => { if (!open) setDetailMilestone(null); }}
				milestone={detailMilestone ? (milestonesQuery.data?.find((m) => m.id === detailMilestone.id) ?? detailMilestone) : null}
				workspaceId={workspaceId}
				projectId={projectId}
			/>
		</div>
	);
}



/** 归档列表里的删除：内联小弹窗确认（不叠第二个模态框）。 */
function ArchiveDeleteButton(props: { task: Task; onDelete: (task: Task) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={<Button size="sm" variant="destructive">删除</Button>}
			/>
			<PopoverPopup className="w-52 p-2" align="end">
				<div className="space-y-2 p-1">
					<p className="break-words text-xs leading-relaxed text-muted-foreground">
						永久删除「{props.task.title}」？此操作不可撤销。
					</p>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
							取消
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								setOpen(false);
								props.onDelete(props.task);
							}}
						>
							删除
						</Button>
					</div>
				</div>
			</PopoverPopup>
		</Popover>
	);
}


/** 里程碑删除:内联小弹窗确认(仿归档删除,不叠第二个模态框)。 */
function MilestoneDeleteButton(props: { milestone: Milestone; onDelete: (m: Milestone) => void; className?: string }) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button type="button" aria-label={`删除里程碑 ${props.milestone.name}`} title="删除里程碑"
						className={props.className ?? ""}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}>
						<TrashIcon className="size-3.5" />
					</button>
				}
			/>
			<PopoverPopup className="w-52 p-2" align="end">
				<div className="space-y-2 p-1">
					<p className="break-words text-xs leading-relaxed text-muted-foreground">
						删除里程碑「{props.milestone.name}」？其关联任务将一并解除，此操作不可撤销。
					</p>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
						<Button size="sm" variant="destructive" onClick={() => { setOpen(false); props.onDelete(props.milestone); }}>删除</Button>
					</div>
				</div>
			</PopoverPopup>
		</Popover>
	);
}
