// 可拖拽的看板列：列头（名称/计数/操作）+ 任务列表（SortableContext）+ 添加任务表单。
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
import type { BoardColumn } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export default function SortableColumn(props: {
	column: BoardColumn;
	labels: Label[];
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

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex w-72 shrink-0 flex-col rounded-[3px] border bg-card/35 ${
				isDragging ? "z-10 opacity-60" : ""
			}`}
		>
			<div
				{...attributes}
				{...listeners}
				className="flex cursor-grab items-center gap-1.5 border-b px-3 py-2.5 active:cursor-grabbing"
			>
				<GripVerticalIcon className="size-4 text-muted-foreground/50" />
				<span className="font-display min-w-0 flex-1 truncate text-[15px] font-semibold">
					{column.name}
				</span>
				<span className="font-mono-num font-mono text-xs text-muted-foreground">
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
					<p className="rounded-[3px] border border-dashed p-3 text-center text-xs text-muted-foreground">
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
