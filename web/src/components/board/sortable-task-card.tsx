// 可拖拽的任务卡片（借鉴原型 .card：白卡 + 圆角 + hover 上浮；标签=小圆点+灰字）。
// 整卡即拖拽面（无独立手柄）：点击打开详情；按住移动 ≥8px（PointerSensor）开始拖拽，
// 拖拽激活后 dnd-kit 在捕获阶段拦截 click，不会误触打开详情。右上 hover 操作按钮不触发拖拽与跳转。

// TaskCardView 是纯展示层：SortableTaskCard（useSortable）与看板页 DragOverlay 复用同一张卡。
import { forwardRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ArchiveIcon,
	CalendarIcon,
	ClockIcon,
	TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverPopup,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { dueDisplay, dueState } from "@/lib/due";
import { formatTaskCardTime } from "@/lib/format-relative";
import {
	normalizePriority,
	PRIORITY_LABEL,
	priorityColor,
} from "@/lib/priority";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export type TaskCardViewProps = {
	task: Task;
	labels: Label[];
	onOpen?: (task: Task) => void;
	onArchive?: (task: Task) => void;
	onToggleLabel?: (task: Task, label: Label) => void;
	className?: string;
	style?: CSSProperties;
	/** 拖拽中标记：驱动 data-dragging 样式（原卡片半透明，让 DragOverlay 副本成为主视觉）。 */
	dragging?: boolean;
	/** useSortable 的可访问性属性（role/tabIndex/aria-*），需透传到根节点。 */
	attributes?: DraggableAttributes;
	/** useSortable 的指针/键盘监听器（onPointerDown 等），拖拽激活依赖它。 */
	listeners?: Record<string, Function> | undefined;
	/** 键盘拖拽焦点与传感器激活节点。 */
	activatorNodeRef?: (element: HTMLElement | null) => void;
};

/** 任务卡片纯展示层：无拖拽 hooks，供 SortableTaskCard 与 DragOverlay 复用。 */
export const TaskCardView = forwardRef<HTMLDivElement, TaskCardViewProps>(
	function TaskCardView(
		{
			task,
			labels,
			onOpen,
			onArchive,
			onToggleLabel,
			attributes,
			listeners,
			activatorNodeRef,
			className = "",
			style,
			dragging,
		},
		ref,
	) {
		const taskLabels = task.labels ?? [];
		const listenerOnKeyDown = listeners?.onKeyDown as
			| ((event: KeyboardEvent<HTMLDivElement>) => void)
			| undefined;
		const pointerListeners = listeners
			? Object.fromEntries(
					Object.entries(listeners).filter(([name]) => name !== "onKeyDown"),
			  )
			: undefined;

		return (
			<div
				ref={(node) => {
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
					activatorNodeRef?.(node);
				}}
				style={style}
				// 对齐原型 .task-card（方向 F）：6px 圆角、无默认阴影、内边距 11/12/10、子元素 gap 9px。
				className={`kanso-task-card group cursor-grab active:cursor-grabbing ${className}`}
				{...attributes}
				{...pointerListeners}

				data-dragging={dragging || undefined}
				data-task-id={task.id}
				// 键盘可访问（W-6）：整卡挂 attributes，Tab 聚焦 + Enter 打开详情，Space 开始键盘拖拽；
				// 仅响应根节点自身按键，避免吞掉内部输入框/按钮的事件。
				role={onOpen ? "button" : undefined}
				tabIndex={onOpen ? 0 : undefined}
				aria-label={onOpen ? `打开任务 ${task.title}` : undefined}
				onClick={() => onOpen?.(task)}
				onKeyDown={(event) => {
					// dnd-kit 的键盘传感器也通过此监听器工作；显式合并而不是覆盖，
					// 否则 Space 抓取/放下会失效，而 Enter 详情打开仍需保留。
					listenerOnKeyDown?.(event);
					if (!onOpen || event.target !== event.currentTarget) return;
					// 拖拽进行中（含键盘拖拽收尾的 Space/Enter）交给 dnd-kit，不误触打开详情。
					if (dragging) return;
					// Enter 打开详情；Space 留给 KeyboardSensor 开始键盘拖拽。
					if (event.key === "Enter") {
						event.preventDefault();
						onOpen(task);
					}
				}}

			>
				<div className="kanso-task-card__top">
					{/* 整卡即拖拽面：无独立手柄；拖动交给根节点 listeners，点击打开详情。 */}

					{/* 优先级（原型 .pri：11px/600/0.04em 字距，点 + 文字） */}
					<span
						className="kanso-priority tracking-[0.04em]"
						style={{ color: priorityColor(task.priority) }}
					>
						<span className="kanso-priority__dot" />
						{PRIORITY_LABEL[normalizePriority(task.priority)]}
					</span>
				</div>

								{/* 标题（原型 .t-title：13.5px/500/1.5）；修改统一在详情页 */}
				<p className="kanso-task-card__title break-words">{task.title}</p>
				
{/* 标签（原型 .t-tags chip：圆角胶囊、12% 色底 + 色字、11px） */}
				{taskLabels.length > 0 ? (
					<div className="kanso-task-card__labels">
						{taskLabels.map((label) => (
							<span key={label.id} className="kanso-label-chip">
								{label.name}
							</span>
						))}
					</div>
				) : null}

				{/* 底部 meta（原型 t-meta）：左截止日期，右归档与头像 */}
				<div className="kanso-task-card__meta">
					<div className="flex min-w-0 items-center gap-3">
						{task.dueDate ? (
							<DueBadge due={task.dueDate} />
						) : (
							<span className="kanso-task-card__time">
								<ClockIcon className="size-3" />
								{formatTaskCardTime(task.createdAt)}
							</span>
						)}
					</div>
					<div
						className="kanso-task-card__bottom-actions"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => event.stopPropagation()}
					>
						<span className="kanso-task-card__avatar" aria-label="当前用户">
							Ad
						</span>
					</div>
				</div>

				<div
					className="kanso-task-card__actions"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
				>
					<Popover>
						<PopoverTrigger
							render={
								<Button
									variant="ghost"
									size="icon"
									className="kanso-task-card__action"
									aria-label={`标签 ${task.title}`}
								>
									<TagIcon />
								</Button>
							}
						/>
						<PopoverPopup className="w-52 p-2">
							<PopoverTitle className="px-1 pb-1 text-xs font-medium text-muted-foreground">
								标签
							</PopoverTitle>
							{labels.length === 0 ? (
								<p className="px-1 py-2 text-xs text-muted-foreground">
									暂无标签，可先在看板右上角创建
								</p>
							) : (
								<ul className="space-y-0.5">
									{labels.map((label) => {
										const attached = taskLabels.some((l) => l.id === label.id);
										return (
											<li key={label.id}>
												<button
													type="button"
													className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
													onClick={() => onToggleLabel?.(task, label)}
												>
													<span className="flex-1">{label.name}</span>
													{attached ? (
														<span className="text-primary">✓</span>
													) : null}
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</PopoverPopup>
					</Popover>
					<Button
						variant="ghost"
						size="icon"
						className="kanso-task-card__action"
						aria-label={`归档任务 ${task.title}`}
						onClick={() => onArchive?.(task)}
					>
						<ArchiveIcon />
					</Button>
				</div>
			</div>
		);
	},
);

export default function SortableTaskCard(props: {
	task: Task;
	labels: Label[];
	onOpen: (task: Task) => void;
	onArchive: (task: Task) => void;
	onToggleLabel: (task: Task, label: Label) => void;
}) {
	const { task, labels, onOpen, onArchive, onToggleLabel } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: task.id,
		data: { type: "task", taskId: task.id, columnId: task.columnId },
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		// DragOverlay is the visible copy. Keep the sortable source as a layout
		// placeholder; rendering its transformed copy makes it cover neighbors
		// while the pointer moves up/down through the list.
		opacity: isDragging ? 0 : undefined,
	};

	return (
		<TaskCardView
			ref={setNodeRef}
			style={style}
			attributes={attributes}
			listeners={listeners}
			activatorNodeRef={setNodeRef}
			task={task}
			labels={labels}
			onOpen={onOpen}
			onArchive={onArchive}
			onToggleLabel={onToggleLabel}
			// 拖拽中由 DragOverlay 副本承担主视觉，原卡片弱化为占位残影（opacity 走 CSS data-dragging）。
			className={`animate-card-in ${isDragging ? "z-10 shadow-card-hover ring-1 ring-primary/20" : ""}`}
			dragging={isDragging}
		/>
	);
}

/** 截止日期徽章：过期/临期标红，正常弱灰（原型 due-badge）。 */
function DueBadge({ due }: { due: string }) {
	const state = dueState(due);
	const color =
		state === "overdue"
			? "var(--destructive)"
			: state === "soon"
				? "var(--warning)"
				: "var(--muted-foreground)";
	return (
		<span
			className="inline-flex items-center gap-1 text-[11px] font-medium"
			style={{ color }}
		>
			<CalendarIcon className="size-3" />
			{dueDisplay(due)}
		</span>
	);
}
