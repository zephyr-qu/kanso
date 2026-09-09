import type { ComponentProps } from "react";
import {
	DndContext,
	DragOverlay,
	type Announcements,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableColumn from "@/components/board/sortable-column";
import { TaskCardView } from "@/components/board/sortable-task-card";
import { SwimlaneRow } from "@/components/board/swimlane-row";
import { boardCollisionDetection, overSignal } from "@/lib/board-dnd";
import type { DragState, OverType, SwimlaneGroup } from "@/hooks/use-board-drag";
import type { Board } from "@/types/board";
import type { Task } from "@/types/task";

type ColumnProps = ComponentProps<typeof SortableColumn>;

type BoardCanvasProps = {
	board: Board;
	viewMode: "columns" | "swimlane";
	swimlanes: SwimlaneGroup[];
	// 拖拽内部状态经 DragBoardProvider 下发，画布不再搬运；activeTask 仅供 DragOverlay。
	activeTask: Task | null;
	reducedMotion: boolean;
	sensors: ComponentProps<typeof DndContext>["sensors"];
	announcements: Announcements;
	onDragStart: (activeId: string) => void;
	onDragOver: (
		activeId: string,
		overId: string,
		overType: OverType,
		halfPassed: boolean,
	) => void;
	onDragEnd: (event: DragEndEvent) => void;
	onDragCancel: () => void;
	onRename: ColumnProps["onRename"];
	onDelete: ColumnProps["onDelete"];
	onAddTask: ColumnProps["onAddTask"];
	onOpenTask: ColumnProps["onOpenTask"];
	onArchiveTask: ColumnProps["onArchiveTask"];
	onToggleLabel: ColumnProps["onToggleLabel"];
	sortConfig: ColumnProps["sortConfig"];
	onEditTask: (task: Task) => void;
};

export function BoardCanvas({
	board,
	viewMode,
	swimlanes,
	activeTask,
	reducedMotion,
	sensors,
	announcements,
	onDragStart,
	onDragOver,
	onDragEnd,
	onDragCancel,
	onRename,
	onDelete,
	onAddTask,
	onOpenTask,
	onArchiveTask,
	onToggleLabel,
	sortConfig,
	onEditTask,
}: BoardCanvasProps) {
	return (
		<DndContext
			accessibility={{
				announcements,
				screenReaderInstructions: {
					draggable:
						"按空格或 Enter 抓取。使用方向键移动，按空格或 Enter 放下，按 Escape 取消。",
				},
			}}
			sensors={sensors}
			collisionDetection={boardCollisionDetection}
			onDragStart={(event) => onDragStart(String(event.active.id))}
			onDragEnd={onDragEnd}
			onDragOver={(event) => {
				const { overId, overType, halfPassed } = overSignal(event);
				onDragOver(String(event.active.id), overId, overType, halfPassed);
			}}
			onDragCancel={onDragCancel}
		>
			<SortableContext
				items={board.columns.map((column) => column.id)}
				strategy={horizontalListSortingStrategy}
			>
				{viewMode === "columns" ? (
					<div className="kanso-board-row flex items-start">
						{board.columns.map((column) => (
							<SortableColumn
								key={column.id}
								column={column}
								labels={board.labels}
								sortConfig={sortConfig}
								onRename={onRename}
								onDelete={onDelete}
								onAddTask={onAddTask}
								onOpenTask={onOpenTask}
								onArchiveTask={onArchiveTask}
								onToggleLabel={onToggleLabel}
							/>
						))}
					</div>
				) : (
					<div className="kanso-swimlanes">
						{swimlanes.map((group) => (
							<SwimlaneRow
								key={group.id}
								group={group}
								columns={board.columns}
								onOpen={onOpenTask}
								onEdit={onEditTask}
								onArchive={onArchiveTask}
							/>
						))}
					</div>
				)}
			</SortableContext>
			{viewMode === "columns" && activeTask ? (
				<DragOverlay
					className="kanso-drag-overlay"
					dropAnimation={
						reducedMotion
							? null
							: {
									duration: 180,
									easing: "cubic-bezier(0.2, 0, 0, 1)",
								}
					}
				>
					<div className="pointer-events-none" style={{ width: 260 }}>
						<TaskCardView task={activeTask} labels={board.labels} />
					</div>
				</DragOverlay>
			) : null}
		</DndContext>
	);
}
