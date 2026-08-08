// 看板页：横向列布局 + 列拖拽排序（dnd-kit）+ 列/任务 CRUD。
// 任务跨列/同列拖拽在 ticket 06 接入。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
	arrayMove,
	horizontalListSortingStrategy,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	GripVerticalIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import { Link, useParams } from "react-router";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { Board, BoardColumn, Column } from "@/types/board";
import type { Task } from "@/types/task";

// 列内"添加任务"的内联表单（回车创建）。
function AddTaskForm(props: { onAdd: (title: string) => void }) {
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");

	if (!adding) {
		return (
			<Button
				variant="ghost"
				className="w-full justify-start text-xs text-muted-foreground"
				onClick={() => setAdding(true)}
			>
				<PlusIcon /> 添加任务
			</Button>
		);
	}
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!title.trim()) return;
				props.onAdd(title.trim());
				setTitle("");
				setAdding(false);
			}}
		>
			<Input
				autoFocus
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onBlur={() => setAdding(false)}
				placeholder="任务标题，回车创建"
				className="h-8 text-sm"
			/>
		</form>
	);
}

// 可拖拽的任务卡片（含编辑/删除操作，按钮不触发拖拽）。
function SortableTaskCard(props: {
	task: Task;
	onEdit: (task: Task) => void;
	onDelete: (task: Task) => void;
}) {
	const { task, onEdit, onDelete } = props;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: task.id,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={`group relative cursor-grab rounded-md border bg-card p-3 text-sm active:cursor-grabbing ${
				isDragging ? "z-10 opacity-60" : ""
			}`}
		>
			<p className="break-words pr-6">{task.title}</p>
			<div
				className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
				onPointerDown={(e) => e.stopPropagation()}
			>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label={`编辑任务 ${task.title}`}
					onClick={() => onEdit(task)}
				>
					<PencilIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 text-destructive"
					aria-label={`删除任务 ${task.title}`}
					onClick={() => onDelete(task)}
				>
					<TrashIcon />
				</Button>
			</div>
		</div>
	);
}

function SortableColumn(props: {
	column: BoardColumn;
	onRename: (column: BoardColumn) => void;
	onDelete: (column: BoardColumn) => void;
	onAddTask: (columnId: string, title: string) => void;
	onEditTask: (task: Task) => void;
	onDeleteTask: (task: Task) => void;
}) {
	const { column, onRename, onDelete, onAddTask, onEditTask, onDeleteTask } =
		props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: column.id,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${
				isDragging ? "z-10 opacity-60" : ""
			}`}
		>
			<div
				{...attributes}
				{...listeners}
				className="flex cursor-grab items-center gap-1 border-b px-3 py-2 active:cursor-grabbing"
			>
				<GripVerticalIcon className="size-4 text-muted-foreground/60" />
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{column.name}
				</span>
				<span className="text-xs text-muted-foreground">
					{column.tasks.length}
				</span>
				<div className="flex" onPointerDown={(e) => e.stopPropagation()}>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={`重命名列 ${column.name}`}
						onClick={() => onRename(column)}
					>
						<PencilIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-destructive"
						aria-label={`删除列 ${column.name}`}
						onClick={() => onDelete(column)}
					>
						<TrashIcon />
					</Button>
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-2">
				{column.tasks.length === 0 ? (
					<p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
						空列
					</p>
				) : (
					<SortableContext
						items={column.tasks.map((t) => t.id)}
						strategy={verticalListSortingStrategy}
					>
						{column.tasks.map((task) => (
							<SortableTaskCard
								key={task.id}
								task={task}
								onEdit={onEditTask}
								onDelete={onDeleteTask}
							/>
						))}
					</SortableContext>
				)}
				<AddTaskForm onAdd={(title) => onAddTask(column.id, title)} />
			</div>
		</div>
	);
}

export default function BoardPage() {
	const { projectId = "" } = useParams();
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<BoardColumn | null>(null);
	const [deleting, setDeleting] = useState<BoardColumn | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [deletingTask, setDeletingTask] = useState<Task | null>(null);

	const {
		data: board,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["board", projectId],
		queryFn: () => api<Board>(`/api/projects/${projectId}`),
		enabled: projectId !== "",
	});

	const invalidateBoard = () =>
		queryClient.invalidateQueries({ queryKey: ["board", projectId] });

	const createColumnMutation = useMutation({
		mutationFn: (name: string) =>
			api<Column>(`/api/projects/${projectId}/columns`, {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateBoard,
	});

	const renameColumnMutation = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Column>(`/api/columns/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateBoard,
	});

	const deleteColumnMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/columns/${id}`, { method: "DELETE" }),
		onSuccess: invalidateBoard,
	});

	const moveColumnMutation = useMutation({
		mutationFn: ({ id, position }: { id: string; position: number }) =>
			api<void>(`/api/columns/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ position }),
			}),
		onSuccess: invalidateBoard,
	});

	const createTaskMutation = useMutation({
		mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
			api<Task>(`/api/columns/${columnId}/tasks`, {
				method: "POST",
				body: JSON.stringify({ title }),
			}),
		onSuccess: invalidateBoard,
	});

	const updateTaskMutation = useMutation({
		mutationFn: ({ id, title }: { id: string; title: string }) =>
			api<Task>(`/api/tasks/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ title }),
			}),
		onSuccess: invalidateBoard,
	});

	const deleteTaskMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/tasks/${id}`, { method: "DELETE" }),
		onSuccess: invalidateBoard,
	});

	const moveTaskMutation = useMutation({
		mutationFn: ({ id, columnId, position }: { id: string; columnId: string; position: number }) =>
			api<void>(`/api/tasks/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ columnId, position }),
			}),
		// 失败回滚：重新拉取服务端真值；成功后以 invalidate 收敛 reindex。
		onError: invalidateBoard,
		onSuccess: invalidateBoard,
	});

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id || !board) return;
		const activeId = String(active.id);
		const overId = String(over.id);

		// 列拖拽（active 是列 ID）。
		const oldColIndex = board.columns.findIndex((c) => c.id === activeId);
		if (oldColIndex >= 0) {
			const newColIndex = board.columns.findIndex((c) => c.id === overId);
			if (newColIndex < 0) return;
			// 乐观更新：立即反映，服务端 reindex 后以 invalidate 收敛。
			queryClient.setQueryData<Board>(["board", projectId], (old) =>
				old ? { ...old, columns: arrayMove(old.columns, oldColIndex, newColIndex) } : old,
			);
			moveColumnMutation.mutate({ id: activeId, position: newColIndex });
			return;
		}

		// 任务拖拽：定位源列与目标列/位置。
		let sourceColumn: BoardColumn | undefined;
		let dragged: Task | undefined;
		for (const column of board.columns) {
			const task = column.tasks.find((t) => t.id === activeId);
			if (task) {
				sourceColumn = column;
				dragged = task;
				break;
			}
		}
		if (!sourceColumn || !dragged) return;

		// 目标：over 是列（空列区域）或任务。
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
		if (sourceColumn.id === targetColumn.id && sourceColumn.tasks.indexOf(dragged) === targetIndex) return;

		// 乐观更新：从源列移除、插入目标列。
		const newColumns = board.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));
		const src = newColumns.find((c) => c.id === sourceColumn.id)!;
		src.tasks = src.tasks.filter((t) => t.id !== dragged.id);
		const dst = newColumns.find((c) => c.id === targetColumn.id)!;
		dst.tasks.splice(Math.min(targetIndex, dst.tasks.length), 0, {
			...dragged,
			columnId: targetColumn.id,
		});
		queryClient.setQueryData<Board>(["board", projectId], (old) =>
			old ? { ...old, columns: newColumns } : old,
		);
		moveTaskMutation.mutate({
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
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						← 项目列表
					</Link>
					<h1 className="truncate text-lg font-semibold">
						{board?.project.name ?? "看板"}
					</h1>
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<PlusIcon /> 新建列
				</Button>
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
										onRename={setRenaming}
										onDelete={setDeleting}
										onAddTask={(columnId, title) =>
											createTaskMutation.mutate({ columnId, title })
										}
										onEditTask={setEditingTask}
										onDeleteTask={setDeletingTask}
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
					await createColumnMutation.mutateAsync(name);
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
						await renameColumnMutation.mutateAsync({ id: renaming.id, name });
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
					if (deleting) await deleteColumnMutation.mutateAsync(deleting.id);
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
						await updateTaskMutation.mutateAsync({
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
						await deleteTaskMutation.mutateAsync(deletingTask.id);
				}}
			/>
		</div>
	);
}
