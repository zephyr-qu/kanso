// 泳道视图的行 / 格子 / 任务卡（从 board.tsx 迁出，与 components/board 其余零件同源）。
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon } from "lucide-react";
import type { SwimlaneGroup } from "@/hooks/use-board-drag";
import type { BoardColumn } from "@/types/board";
import type { Task } from "@/types/task";

type SwimlaneActions = {
	onOpen: (task: Task) => void;
	onEdit: (task: Task) => void;
	onArchive: (task: Task) => void;
};

export function SwimlaneRow({
	group,
	columns,
	onOpen,
	onEdit,
	onArchive,
}: { group: SwimlaneGroup; columns: BoardColumn[] } & SwimlaneActions) {
	return (
		<section className="kanso-swimlane">
			<header className="kanso-swimlane__header">
				<span className="kanso-label-chip">{group.name}</span>
				<span className="text-xs text-muted-foreground">
					{group.tasks.length} 任务
				</span>
			</header>
			<div className="kanso-swimlane__grid">
				{columns.map((column) => {
					const tasks = group.tasks.filter((task) => task.columnId === column.id);
					return (
						<SwimlaneCell
							key={column.id}
							id={`swimlane:${group.id}:${column.id}`}
							columnName={column.name}
							tasks={tasks}
							onOpen={onOpen}
							onEdit={onEdit}
							onArchive={onArchive}
						/>
					);
				})}
			</div>
		</section>
	);
}

function SwimlaneCell(
	props: { id: string; columnName: string; tasks: Task[] } & SwimlaneActions,
) {
	const { setNodeRef, isOver } = useDroppable({ id: props.id });
	return (
		<div
			ref={setNodeRef}
			className={`kanso-swimlane__cell ${isOver ? "is-over" : ""}`}
		>
			<div className="kanso-swimlane__column-name">{props.columnName}</div>
			{props.tasks.length === 0 ? (
				<span className="kanso-swimlane__empty">无任务</span>
			) : (
				props.tasks.map((task) => (
					<SwimlaneTask
						key={task.id}
						task={task}
						onOpen={props.onOpen}
						onEdit={props.onEdit}
						onArchive={props.onArchive}
					/>
				))
			)}
		</div>
	);
}

function SwimlaneTask(props: { task: Task } & SwimlaneActions) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: props.task.id,
		});
	return (
		<article
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			style={{ transform: CSS.Transform.toString(transform) }}
			className="kanso-task-card kanso-swimlane__task"
			data-dragging={isDragging || undefined}
			onClick={() => props.onOpen(props.task)}
		>
			<span className="kanso-task-card__title">{props.task.title}</span>
			{props.task.dueDate ? (
				<span className="kanso-due-badge text-muted-foreground">
					<CalendarIcon className="size-3" />
					{props.task.dueDate}
				</span>
			) : null}
			<div
				className="kanso-task-card__actions"
				onClick={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					className="kanso-icon-button"
					aria-label={`编辑任务 ${props.task.title}`}
					onClick={() => props.onEdit(props.task)}
				>
					✎
				</button>
				<button
					type="button"
					className="kanso-icon-button"
					aria-label={`归档任务 ${props.task.title}`}
					onClick={() => props.onArchive(props.task)}
				>
					⌁
				</button>
			</div>
		</article>
	);
}
