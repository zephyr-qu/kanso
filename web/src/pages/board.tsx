// 看板页：编排与渲染。数据/缓存/乐观更新逻辑都在领域 hooks 里（架构候选 1）。
import { useState } from "react";
import {
	DndContext,
	PointerSensor,
	closestCorners,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon, TagIcon } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import ConfirmDialog from "@/components/confirm-dialog";
import LabelManagerDialog from "@/components/label-manager";
import NameDialog from "@/components/name-dialog";
import SortableColumn from "@/components/board/sortable-column";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useBoardData } from "@/hooks/use-board-data";
import { useLabelMutations } from "@/hooks/use-label-mutations";
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import type { BoardColumn } from "@/types/board";
import type { Task } from "@/types/task";

export default function BoardPage() {
	const { projectId = "" } = useParams();
	const navigate = useNavigate();
	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<BoardColumn | null>(null);
	const [deleting, setDeleting] = useState<BoardColumn | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [deletingTask, setDeletingTask] = useState<Task | null>(null);
	const [labelManagerOpen, setLabelManagerOpen] = useState(false);

	const { board, isLoading, isError, columnOps } = useBoardData(projectId);
	const taskOps = useTaskMutations(projectId);
	const labelOps = useLabelMutations(projectId);

	// 实时：其他窗口的写操作经 WS 推送后 invalidate 本页查询。
	useRealtime(projectId);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	function handleDragEnd(event: DragEndEvent) {
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

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b px-6 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<Link
						to={`/w/${board?.project.workspaceId ?? ""}`}
						className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
					>
						← Projects
					</Link>
					<span className="text-muted-foreground/40">/</span>
					<h1 className="font-display truncate text-xl font-semibold tracking-wide">
						{board?.project.name ?? "看板"}
					</h1>
				</div>
				<div className="flex gap-2">
					<Button variant="ghost" onClick={() => setLabelManagerOpen(true)}>
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
				<div className="flex-1 overflow-auto p-4">
					<DndContext
						sensors={sensors}
						collisionDetection={closestCorners}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={board.columns.map((c) => c.id)}
							strategy={horizontalListSortingStrategy}
						>
							<div className="flex items-start gap-3">
								{board.columns.map((column) => (
									<SortableColumn
										key={column.id}
										column={column}
										labels={board.labels}
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
