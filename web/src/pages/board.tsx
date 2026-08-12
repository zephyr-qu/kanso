// 看板页：编排与渲染。数据/缓存/乐观更新逻辑都在领域 hooks 里（架构候选 1）。
import { useEffect, useState } from "react";
import {
	DndContext,
	PointerSensor,
	closestCorners,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragOverEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TagIcon } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import ConfirmDialog from "@/components/confirm-dialog";
import LabelManagerDialog from "@/components/label-manager";
import NameDialog from "@/components/name-dialog";
import SortableColumn from "@/components/board/sortable-column";
import { Button } from "@/components/ui/button";
import { recordProjectOpen } from "@/lib/recent-projects";
import { sortTasks, type SortConfig } from "@/lib/sort-tasks";
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
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import type { BoardColumn } from "@/types/board";
import type { Task } from "@/types/task";

export default function BoardPage() {
	const { projectId = "", workspaceId = "" } = useParams();

	// 打开项目即记录"最近打开"，供仪表盘"项目速览"展示。
	useEffect(() => {
		if (workspaceId && projectId) recordProjectOpen(workspaceId, projectId);
	}, [workspaceId, projectId]);
	const navigate = useNavigate();

	const [createOpen, setCreateOpen] = useState(false);
	// 拖拽悬停的列 id（任务拖到任务上时解析回所属列），用于列容器高亮反馈。
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<BoardColumn | null>(null);
	const [deleting, setDeleting] = useState<BoardColumn | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [deletingTask, setDeletingTask] = useState<Task | null>(null);
	const [labelManagerOpen, setLabelManagerOpen] = useState(false);
	// 显示层排序（按项目持久化到 localStorage，刷新保持）：不改写 position。
	const { sort: sortConfig, setSort: setSortConfig } = useBoardSort(projectId);
	const { board, isLoading, isError, columnOps } = useBoardData(projectId);
	const taskOps = useTaskMutations(projectId);
	const labelOps = useLabelMutations(projectId);

	// 实时：其他窗口的写操作经 WS 推送后 invalidate 本页查询。
	useRealtime(projectId);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	function handleDragEnd(event: DragEndEvent) {
		// 结束拖拽即清除列悬停高亮，避免残留。
		setDragOverId(null);
		const { active, over } = event;
		if (!over || active.id === over.id || !board) return;
		const activeId = String(active.id);
		const overId = String(over.id);

		// 列拖拽。
		const oldColIndex = board.columns.findIndex((c) => c.id === activeId);
		if (oldColIndex >= 0) {
			const newColIndex = board.columns.findIndex((c) => c.id === overId);
			if (newColIndex < 0) return;
			columnOps.moveColumn.mutate({ id: activeId, position: newColIndex });
			return;
		}

		// 任务拖拽：定位源列与目标列/位置（数组重排逻辑在 hook 内，这里只做事件映射）。
		const dragged = board.columns
			.flatMap((c) => c.tasks)
			.find((t) => t.id === activeId);
		if (!dragged) return;

		let targetColumn = board.columns.find((c) => c.id === overId);
		let targetIndex = targetColumn ? targetColumn.tasks.length : 0;
		if (!targetColumn) {
			for (const column of board.columns) {
				const idx = column.tasks.findIndex((t) => t.id === overId);
				if (idx >= 0) {
					targetColumn = column;
					targetIndex = idx;
					break;
				}
			}
		}
		if (!targetColumn) return;
		// 同列且位置没变则跳过。
		const sourceColumn = board.columns.find((c) => c.id === dragged.columnId);
		if (
			sourceColumn?.id === targetColumn.id &&
			sourceColumn.tasks.indexOf(dragged) === targetIndex
		) {
			return;
		}

		taskOps.moveTask.mutate({
			id: dragged.id,
			columnId: targetColumn.id,
			position: targetIndex,
		});
	}

	// 拖拽悬停反馈：over.id 可能是列，也可能是任务（需解析回所属列）。
	function handleDragOver(event: DragOverEvent) {
		const overId = event.over ? String(event.over.id) : "";
		if (!overId || !board) {
			setDragOverId(null);
			return;
		}
		if (board.columns.some((c) => c.id === overId)) {
			setDragOverId(overId);
			return;
		}
		const owner = board.columns.find((c) => c.tasks.some((t) => t.id === overId));
		setDragOverId(owner?.id ?? null);
	}


	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
				<div className="flex min-w-0 items-baseline gap-3">
					<Link
						to={`/w/${board?.project.workspaceId ?? ""}`}
						className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
					>
						← 项目
					</Link>
					<span className="text-muted-foreground/40">/</span>
					<h1 className="truncate text-[17px] font-[650] tracking-tight">
						{board?.project.name ?? "看板"}
					</h1>
				</div>
				<div className="flex gap-2">
					{/* 显示层排序切换器：字段（原顺序/标题/创建时间）+ 方向；不改写 position。 */}
					<div className="flex items-center gap-0.5 rounded-[6px] border bg-background px-1 py-0.5">
						{(
							[
								{ value: "position", label: "原顺序" },
								{ value: "title", label: "标题" },
								{ value: "createdAt", label: "创建时间" },
							] as const
						).map((opt) => (
							<Button
								key={opt.value}
								variant={sortConfig.field === opt.value ? "secondary" : "ghost"}
								size="sm"
								className="h-6 px-2 text-xs"
								aria-pressed={sortConfig.field === opt.value}
								onClick={() =>
									setSortConfig((c) => ({ ...c, field: opt.value }))
								}
							>
								{opt.label}
							</Button>
						))}
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							aria-label={
								sortConfig.direction === "asc" ? "切换为降序" : "切换为升序"
							}
							onClick={() =>
								setSortConfig((c) => ({
									...c,
									direction: c.direction === "asc" ? "desc" : "asc",
								}))
							}
						>
							{sortConfig.direction === "asc" ? (
								<ArrowUpIcon />
							) : (
								<ArrowDownIcon />
							)}
						</Button>
					</div>
					<Button variant="outline" onClick={() => setLabelManagerOpen(true)}>
						<TagIcon /> 标签
					</Button>
					<Button onClick={() => setCreateOpen(true)}>
						<PlusIcon /> 新建列
					</Button>
				</div>
			</div>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : isError ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载看板失败
				</p>
			) : board && board.columns.length > 0 ? (
				<div className="flex-1 overflow-auto py-6 pl-4 pr-7">
					<DndContext
						sensors={sensors}
						collisionDetection={closestCorners}
						onDragEnd={handleDragEnd}
						onDragOver={handleDragOver}
						onDragCancel={() => setDragOverId(null)}
					>
						<SortableContext
							items={board.columns.map((c) => c.id)}
							strategy={horizontalListSortingStrategy}
						>
							<div className="flex items-start">
								{board.columns.map((column) => (
									<SortableColumn
										key={column.id}
										column={column}
										dragOver={dragOverId === column.id}
										labels={board.labels}
										sortConfig={sortConfig}
										onRename={setRenaming}
										onDelete={setDeleting}
										onAddTask={(columnId, title) =>
											taskOps.createTask.mutate({ columnId, title })
										}
										onOpenTask={(task) =>
											navigate(
												`/w/${board?.project.workspaceId ?? ""}/p/${projectId}/t/${task.id}`,
											)
										}
										onEditTask={setEditingTask}
										onDeleteTask={setDeletingTask}
										onToggleLabel={(task, label) =>
											labelOps.toggleLabel.mutate({ task, label })
										}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				</div>
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
			<ConfirmDialog
				open={deletingTask !== null}
				onOpenChange={(open) => {
					if (!open) setDeletingTask(null);
				}}
				title="删除任务"
				description={`确定删除任务"${deletingTask?.title ?? ""}"吗？此操作不可撤销。`}
				onConfirm={async () => {
					if (deletingTask)
						await taskOps.deleteTask.mutateAsync(deletingTask.id);
				}}
			/>
			<LabelManagerDialog
				open={labelManagerOpen}
				onOpenChange={setLabelManagerOpen}
				labels={board?.labels ?? []}
				onCreate={async (name, color) => {
					await labelOps.createLabel.mutateAsync({ name, color });
				}}
				onRename={async (id, name) => {
					await labelOps.renameLabel.mutateAsync({ id, name });
				}}
				onDelete={async (id) => {
					await labelOps.deleteLabel.mutateAsync(id);
				}}
			/>
		</div>
	);
}
