// 可拖拽的任务卡片（借鉴原型 .card：白卡 + 圆角 + hover 上浮；标签=小圆点+灰字）。
// 保留右上 hover 操作（标签/编辑/删除，按钮不触发拖拽与跳转）。
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PencilIcon, TagIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverPopup,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export default function SortableTaskCard(props: {
	task: Task;
	labels: Label[];
	onOpen: (task: Task) => void;
	onEdit: (task: Task) => void;
	onDelete: (task: Task) => void;
	onToggleLabel: (task: Task, label: Label) => void;
}) {
	const { task, labels, onOpen, onEdit, onDelete, onToggleLabel } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: task.id,
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	const taskLabels = task.labels ?? [];

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={`group relative cursor-grab rounded-[10px] border bg-card p-3.5 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-foreground/15 hover:shadow-card-hover active:cursor-grabbing ${
				isDragging ? "z-10 opacity-60" : ""
			}`}
			onClick={() => onOpen(task)}
		>
			{taskLabels.length > 0 ? (
				<div className="mb-2 flex flex-wrap gap-x-1.5 gap-y-1">
					{taskLabels.map((label) => (
						<span
							key={label.id}
							className="inline-flex items-center gap-[5px] text-xs text-muted-foreground"
						>
							<span
								className="size-2 shrink-0 rounded-full"
								style={{ backgroundColor: label.color }}
							/>
							{label.name}
						</span>
					))}
				</div>
			) : null}
			<p className="break-words pr-12 text-sm leading-normal">{task.title}</p>
			{task.description ? (
				<p className="mt-1 line-clamp-2 text-xs leading-normal text-muted-foreground">
					{task.description}
				</p>
			) : null}

			<div
				className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<Popover>
					<PopoverTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="size-6"
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
												onClick={() => onToggleLabel(task, label)}
											>
												<span
													className="size-2.5 shrink-0 rounded-full"
													style={{ backgroundColor: label.color }}
												/>
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
