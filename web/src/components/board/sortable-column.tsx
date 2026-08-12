// 可拖拽的看板列（借鉴原型 .col：280px 列 + 列头名称/计数 + 任务列表 + 添加任务）。
// 列操作（重命名/删除）hover 显示；拖拽把手保留（列排序需要）。
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import AddTaskForm from "@/components/board/add-task-form";
import SortableTaskCard from "@/components/board/sortable-task-card";
import { Button } from "@/components/ui/button";
import { sortTasks, type SortConfig } from "@/lib/sort-tasks";
import type { BoardColumn } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export default function SortableColumn(props: {
	column: BoardColumn;
	labels: Label[];
	sortConfig: SortConfig;
	onRename: (column: BoardColumn) => void;
	onDelete: (column: BoardColumn) => void;
	onAddTask: (columnId: string, title: string) => void;
	onOpenTask: (task: Task) => void;
	onEditTask: (task: Task) => void;
	onDeleteTask: (task: Task) => void;
	onToggleLabel: (task: Task, label: Label) => void;
}) {
	const {
		column,
		labels,
		sortConfig,
		onRename,
		onDelete,
		onAddTask,
		onOpenTask,
		onEditTask,
		onDeleteTask,
		onToggleLabel,
	} = props;
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
	// 显示层排序：仅改变渲染顺序，不改写 position；排序视图下禁用任务拖拽（避免与 position 语义冲突）。
	const sortActive = sortConfig.field !== "position";
	const visibleTasks = sortActive ? sortTasks(column.tasks, sortConfig) : column.tasks;
	const sortable = !sortActive;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`group/col flex w-[280px] shrink-0 flex-col px-3 ${isDragging ? "z-10 opacity-60" : ""}`}
		>
			<div
				{...attributes}
				{...listeners}
				className="flex cursor-grab items-center gap-2 px-1 pb-3 pt-1 active:cursor-grabbing"
			>
				<GripVerticalIcon className="size-4 shrink-0 text-muted-foreground/40" />
				<span className="min-w-0 flex-1 truncate text-sm font-semibold">
					{column.name}
				</span>
				<span className="shrink-0 rounded-full bg-muted px-[7px] py-0.5 text-[11px] tabular-nums text-muted-foreground">
					{column.tasks.length}
				</span>
				<div
					className="flex shrink-0 opacity-0 transition-opacity group-hover/col:opacity-100"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						aria-label={`重命名列 ${column.name}`}
						onClick={() => onRename(column)}
					>
						<PencilIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-destructive"
						aria-label={`删除列 ${column.name}`}
						onClick={() => onDelete(column)}
					>
						<TrashIcon />
					</Button>
				</div>
			</div>

				<div className="flex flex-1 flex-col gap-2">
				{column.tasks.length === 0 ? (
					<p className="rounded-[10px] border border-dashed p-4 text-center text-xs text-muted-foreground">
						空列
					</p>
				) : (
					<SortableContext
						items={visibleTasks.map((t) => t.id)}
						strategy={verticalListSortingStrategy}
						disabled={!sortable}
					>
						{visibleTasks.map((task) => (
							<SortableTaskCard
								key={task.id}
								task={task}
								labels={labels}
								onOpen={onOpenTask}
								onEdit={onEditTask}
								onDelete={onDeleteTask}
								onToggleLabel={onToggleLabel}
							/>
						))}
					</SortableContext>
				)}
				<AddTaskForm onAdd={(title) => onAddTask(column.id, title)} />
			</div>
		</div>
	);
}
