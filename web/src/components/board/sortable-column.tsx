// 可拖拽的看板列（借鉴原型 .col：280px 列 + 列头名称/计数 + 任务列表 + 添加任务）。
// 列操作（重命名/删除）hover 显示；拖拽把手保留（列排序需要）。
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { Fragment } from "react";
import AddTaskForm from "@/components/board/add-task-form";
import SortableTaskCard, { TaskCardView } from "@/components/board/sortable-task-card";
import { Button } from "@/components/ui/button";
import { sortTasks, type SortConfig } from "@/lib/sort-tasks";
import type { BoardColumn } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export default function SortableColumn(props: {
	column: BoardColumn;
	dragOver: boolean;
	/** 正在拖拽的任务 id（跨列动画用；非拖拽/列拖拽时为 null）。 */
	dragActiveTaskId: string | null;
	/** 被拖拽任务所在的源列 id。 */
	activeTaskColumnId: string | null;
	/** 任务跨列拖拽的临时落点（{columnId, index}），跨列中非 null；同列排序为 null。 */
	dragPos: { columnId: string; index: number } | null;
	/** 当前拖拽任务，用于在目标列渲染与真实卡片等高的占位。 */
	draggedTask: Task | null;
	labels: Label[];
	sortConfig: SortConfig;
	onRename: (column: BoardColumn) => void;
	onDelete: (column: BoardColumn) => void;
	onAddTask: (columnId: string, title: string) => void;
	onOpenTask: (task: Task) => void;
	onRenameTask: (task: Task, title: string) => void;
	onArchiveTask: (task: Task) => void;
	onToggleLabel: (task: Task, label: Label) => void;
}) {
	const {
		column,
		dragOver,
		dragActiveTaskId,
		activeTaskColumnId,
		dragPos,
		draggedTask,
		labels,
		sortConfig,
		onRename,
		onDelete,
		onAddTask,
		onOpenTask,
		onRenameTask,
		onArchiveTask,
		onToggleLabel,
	} = props;
	const {
		attributes,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: column.id,
		data: { type: "column", columnId: column.id },
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	// 显示层排序：仅改变渲染顺序，不改写 position；排序视图下禁用任务拖拽（避免与 position 语义冲突）。
	// 列内任务全部渲染——此前 10 条硬截断会让第 11+ 个任务不可见也不可达，已移除。
	const sortActive = sortConfig.field !== "position";
	const visibleTasks = sortActive ? sortTasks(column.tasks, sortConfig) : column.tasks;
	const sortable = !sortActive;

	// SortableContext 的 items 必须与实际渲染的 sortable 卡片一一对应。
	// 跨列时仍保留源卡片作为布局占位（由 SortableTaskCard 隐藏），
	// 目标列另外渲染一张不可拖拽的等高占位卡，避免只改 items 却没有真实空间。
	const baseTaskIds = visibleTasks.map((t) => t.id);
	const isCrossColumnTarget =
		sortable &&
		dragActiveTaskId !== null &&
		activeTaskColumnId !== null &&
		draggedTask !== null &&
		dragPos?.columnId === column.id &&
		activeTaskColumnId !== column.id;
	const placeholderIndex = isCrossColumnTarget
		? Math.min(dragPos?.index ?? visibleTasks.length, visibleTasks.length)
		: -1;
	const items = baseTaskIds;
	const placeholder = isCrossColumnTarget ? (
		<div
			key={`drag-placeholder-${draggedTask.id}`}
			aria-hidden="true"
			className="kanso-drag-placeholder pointer-events-none"
		>
			<TaskCardView
				task={draggedTask}
				labels={labels}
				style={{ visibility: "hidden" }}
			/>
		</div>
	) : null;
	const taskList = (
		<>
			{visibleTasks.map((task, index) => (
				<Fragment key={task.id}>
					{placeholderIndex === index ? placeholder : null}
					<SortableTaskCard
						task={task}
						labels={labels}
						onOpen={onOpenTask}
						onRename={onRenameTask}
						onArchive={onArchiveTask}
						onToggleLabel={onToggleLabel}
					/>
				</Fragment>
			))}
			{placeholderIndex === visibleTasks.length ? placeholder : null}
		</>
	);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`group/col flex w-[282px] shrink-0 ${isDragging ? "z-10 opacity-60" : ""}`}
		>
			<div
				// 对齐原型 .col：282px 列、3% 暖灰底、1px 边框、12px 圆角。
				className="kanso-board-column flex flex-1 flex-col transition-[border-color,background-color] duration-150"
				data-drag-over={dragOver || undefined}
			>
			<div className="kanso-board-column__header">
				<div className="kanso-board-column__title">
					<button
						type="button"
						ref={setActivatorNodeRef}
						{...attributes}
						{...listeners}
						className="kanso-board-column__grip-button"
						aria-label={`拖拽列 ${column.name}`}
					>
						<GripVerticalIcon className="kanso-board-column__grip" />
					</button>
					<span className="min-w-0 truncate">{column.name}</span>
					<span className={`kanso-board-column__count ${column.wipLimit !== null && column.wipLimit !== undefined && column.tasks.length > column.wipLimit ? "kanso-wip-warning" : ""}`}>
						{column.tasks.length}{column.wipLimit !== null && column.wipLimit !== undefined ? ` / ${column.wipLimit}` : ""}
					</span>
				</div>
				<div
					className="kanso-board-column__actions"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<Button variant="ghost" size="icon" className="size-6" aria-label={`重命名列 ${column.name}`} onClick={() => onRename(column)}><PencilIcon /></Button>
					<Button variant="ghost" size="icon" className="size-6 text-destructive" aria-label={`删除列 ${column.name}`} onClick={() => onDelete(column)}><TrashIcon /></Button>
				</div>
			</div>

			<div className="kanso-board-column__body flex flex-1 flex-col gap-2">
			{visibleTasks.length === 0 && !isCrossColumnTarget ? (
				<p className="kanso-column-empty text-xs">拖拽任务到这里</p>
			) : (
				<SortableContext
					items={items}
					strategy={verticalListSortingStrategy}
					disabled={!sortable}
				>
					{taskList}
				</SortableContext>
			)}
			<AddTaskForm onAdd={(title) => onAddTask(column.id, title)} />
			</div>
			</div>
		</div>
	);
}
