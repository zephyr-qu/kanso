// 可拖拽的看板列（借鉴原型 .col：280px 列 + 列头名称/计数 + 任务列表 + 添加任务）。
// 列操作（重命名/删除）hover 显示；拖拽把手保留（列排序需要）。
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, TrashIcon } from "lucide-react";
import { Fragment, memo, useRef, useState } from "react";
import AddTaskForm from "@/components/board/add-task-form";
import SortableTaskCard, {
	TaskCardView,
} from "@/components/board/sortable-task-card";
import { Button } from "@/components/ui/button";
import { useColumnDropState } from "@/hooks/use-board-drag";
import { sortTasks, type SortConfig } from "@/lib/sort-tasks";
import type { BoardColumn } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

const SortableColumn = memo(function SortableColumn(props: {
	column: BoardColumn;
	// 拖拽语义经 DragBoardProvider → useColumnDropState 下发，不再裸收内部状态。
	labels: Label[];
	sortConfig: SortConfig;
	onRename: (column: BoardColumn, name: string) => void;
	onDelete: (column: BoardColumn) => void;
	onAddTask: (columnId: string, title: string, priority: string) => void;
	onOpenTask: (task: Task) => void;
	onArchiveTask: (task: Task) => void;
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
		onArchiveTask,
		onToggleLabel,
	} = props;
	const [editingName, setEditingName] = useState(false);
	const [draftName, setDraftName] = useState(column.name);
	const renameHandled = useRef(false);

	function beginRename() {
		renameHandled.current = false;
		setDraftName(column.name);
		setEditingName(true);
	}

	function cancelRename() {
		renameHandled.current = true;
		setDraftName(column.name);
		setEditingName(false);
	}

	function commitRename() {
		if (renameHandled.current) return;
		renameHandled.current = true;
		const nextName = draftName.trim();
		setEditingName(false);
		if (nextName && nextName !== column.name) onRename(column, nextName);
	}
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
	const visibleTasks = sortActive
		? sortTasks(column.tasks, sortConfig)
		: column.tasks;
	const sortable = !sortActive;

	// SortableContext 的 items 必须与实际渲染的 sortable 卡片一一对应。
	// 跨列时仍保留源卡片作为布局占位（由 SortableTaskCard 隐藏），
	// 目标列另外渲染一张不可拖拽的等高占位卡，避免只改 items 却没有真实空间。
	// 拖拽展示语义从 use-board-drag 的纯函数下发（唯一真相源），列只负责渲染。
	const { hovered, placeholderIndex, placeholderTask } = useColumnDropState(
		column.id,
		sortable,
	);
	const items = visibleTasks.map((t) => t.id);
	const placeholder =
		placeholderTask && placeholderIndex !== -1 ? (
			<div
				key={`drag-placeholder-${placeholderTask.id}`}
				aria-hidden="true"
				className="kanso-drag-placeholder pointer-events-none"
			>
				<TaskCardView
					task={placeholderTask}
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
				data-drag-over={hovered || undefined}
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
						{editingName ? (
							<input
								className="kanso-board-column__name-input"
								value={draftName}
								autoFocus
								aria-label={`编辑列名：${column.name}`}
								onChange={(event) => setDraftName(event.target.value)}
								onPointerDown={(event) => event.stopPropagation()}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitRename();
									}
									if (event.key === "Escape") cancelRename();
								}}
								onBlur={commitRename}
							/>
						) : (
							<button
								type="button"
								className="kanso-board-column__name-trigger"
								title="点击修改列名"
								aria-label={`修改列名：${column.name}`}
								onClick={beginRename}
								onPointerDown={(event) => event.stopPropagation()}
							>
								{column.name}
							</button>
						)}
						<span
							className={`kanso-board-column__count ${column.wipLimit !== null && column.wipLimit !== undefined && column.tasks.length > column.wipLimit ? "kanso-wip-warning" : ""}`}
						>
							{column.tasks.length}
							{column.wipLimit !== null && column.wipLimit !== undefined
								? ` / ${column.wipLimit}`
								: ""}
						</span>
					</div>
					<div
						className="kanso-board-column__actions"
						onPointerDown={(e) => e.stopPropagation()}
					>
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

				<div className="kanso-board-column__body flex flex-1 flex-col gap-2">
					{visibleTasks.length === 0 && placeholderIndex === -1 ? (
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
					<AddTaskForm
						onAdd={(title, priority) => onAddTask(column.id, title, priority)}
					/>
				</div>
			</div>
		</div>
	);
});

export default SortableColumn;
