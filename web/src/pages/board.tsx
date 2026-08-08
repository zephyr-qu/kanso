// 看板页：横向列布局 + 列拖拽排序（dnd-kit）+ 列创建/重命名/删除。
// 任务卡片渲染与拖拽在 ticket 05/06 接入；本页先固定列管理与聚合消费。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	horizontalListSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { Board, BoardColumn, Column } from "@/types/board";

function SortableColumn(props: {
	column: BoardColumn;
	onRename: (column: BoardColumn) => void;
	onDelete: (column: BoardColumn) => void;
}) {
	const { column, onRename, onDelete } = props;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
				<span className="min-w-0 flex-1 truncate text-sm font-medium">{column.name}</span>
				<span className="text-xs text-muted-foreground">{column.tasks.length}</span>
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
					column.tasks.map((task) => (
						<div key={task.id} className="rounded-md border bg-card p-3 text-sm">
							{task.title}
						</div>
					))
				)}
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

	const { data: board, isLoading, isError } = useQuery({
		queryKey: ["board", projectId],
		queryFn: () => api<Board>(`/api/projects/${projectId}`),
		enabled: projectId !== "",
	});

	const invalidateBoard = () => queryClient.invalidateQueries({ queryKey: ["board", projectId] });

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
			api<Column>(`/api/columns/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
		onSuccess: invalidateBoard,
	});

	const deleteColumnMutation = useMutation({
		mutationFn: (id: string) => api<void>(`/api/columns/${id}`, { method: "DELETE" }),
		onSuccess: invalidateBoard,
	});

	const moveColumnMutation = useMutation({
		mutationFn: ({ id, position }: { id: string; position: number }) =>
			api<void>(`/api/columns/${id}`, { method: "PATCH", body: JSON.stringify({ position }) }),
		onSuccess: invalidateBoard,
	});

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id || !board) return;
		const oldIndex = board.columns.findIndex((c) => c.id === active.id);
		const newIndex = board.columns.findIndex((c) => c.id === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		// 乐观更新：立即反映，服务端 reindex 后以 invalidate 收敛。
		queryClient.setQueryData<Board>(["board", projectId], (old) =>
			old ? { ...old, columns: arrayMove(old.columns, oldIndex, newIndex) } : old,
		);
		moveColumnMutation.mutate({ id: String(active.id), position: newIndex });
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
					<h1 className="truncate text-lg font-semibold">{board?.project.name ?? "看板"}</h1>
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
				<p className="py-16 text-center text-sm text-destructive">加载看板失败</p>
			) : board && board.columns.length > 0 ? (
				<div className="flex-1 overflow-auto p-4">
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext items={board.columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
							<div className="flex items-start gap-3">
								{board.columns.map((column) => (
									<SortableColumn
										key={column.id}
										column={column}
										onRename={setRenaming}
										onDelete={setDeleting}
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
						<EmptyDescription>点击右上角"新建列"开始组织你的工作流。</EmptyDescription>
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
					if (renaming) await renameColumnMutation.mutateAsync({ id: renaming.id, name });
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
		</div>
	);
}
