import { useState } from "react";
import {
	CalendarIcon,
	FlagIcon,
	MessageSquareIcon,
	MilestoneIcon,
	TagIcon,
} from "lucide-react";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import DatePicker from "@/components/date-picker";
import { PriorityPicker } from "@/components/priority-picker";
import { dueState } from "@/lib/due";
import { normalizePriority, PRIORITY_LABEL, priorityColor } from "@/lib/priority";
import type { Milestone } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";
import type { TaskDetail } from "@/types/task-detail";

type TaskUpdate = (patch: Partial<Pick<Task, "title" | "priority" | "dueDate">>) => void;

type TaskDetailSummaryProps = {
	data: TaskDetail;
	labels?: Label[];
	milestones?: Milestone[];
	onUpdate: TaskUpdate;
	onToggleLabel: (labelId: string, attach: boolean) => void;
	onToggleMilestone: (milestoneId: string, attach: boolean) => void;
};

export function TaskDetailSummary({
	data,
	labels,
	milestones,
	onUpdate,
	onToggleLabel,
	onToggleMilestone,
}: TaskDetailSummaryProps) {
	const [title, setTitle] = useState(data.task.title);
	const [editingTitle, setEditingTitle] = useState(false);

	const saveTitle = () => {
		const nextTitle = title.trim();
		if (!nextTitle) return;
		onUpdate({ title: nextTitle });
		setEditingTitle(false);
	};

	return (
		<>
			<div className="kanso-task-detail__title-row">
				<div className="min-w-0 flex-1">
					{editingTitle ? (
						<div
							className="w-full"
							onBlur={(event) => {
								if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
									setEditingTitle(false);
								}
							}}
						>
						<input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								className="kanso-task-detail__title w-full cursor-text border-0 bg-transparent p-0 outline-none focus-visible:outline-2 focus-visible:outline-primary/40 focus-visible:outline-offset-2"
								autoFocus
								onKeyDown={(event) => {
									if (event.key === "Enter") saveTitle();
									if (event.key === "Escape") setEditingTitle(false);
								}}
							/>
						</div>
					) : (
						<h2
							className="kanso-task-detail__title cursor-text"
							onClick={() => {
								setTitle(data.task.title);
								setEditingTitle(true);
							}}
							title="点击编辑标题"
						>
							{data.task.title}
						</h2>
					)}
					<div className="kanso-task-detail__title-meta">
						<Popover>
							<PopoverTrigger
								render={
									<button
										type="button"
										className="kanso-task-detail__priority cursor-pointer"
										title="修改优先级"
									>
										<span
											className="kanso-priority__dot"
											style={{
												backgroundColor: priorityColor(normalizePriority(data.task.priority)),
											}}
										/>
										{PRIORITY_LABEL[normalizePriority(data.task.priority)]}
									</button>
								}
							/>
							<PopoverPopup className="w-fit p-2">
								<PriorityPicker
									value={normalizePriority(data.task.priority)}
									onChange={(priority) => onUpdate({ priority })}
									titlePrefix="设为"
									size="px-1.5 py-0.5 text-[11px]"
								/>
							</PopoverPopup>
						</Popover>
						{data.labels.map((label) => (
							<span key={label.id} className="kanso-task-detail__label-chip">
								{label.name}
							</span>
						))}
					</div>
				</div>
			</div>

			<div className="kanso-task-detail__meta">
				<div className="kanso-detail-meta-item">
					<CalendarIcon className="size-3.5 opacity-70" />
					截止
					<DatePicker
						value={data.task.dueDate ?? ""}
						onChange={(value) => onUpdate({ dueDate: value })}
						ariaLabel="截止日期"
						showIcon={false}
						placeholder="设置日期"
					/>
					{dueState(data.task.dueDate) === "soon" ? (
						<span className="kanso-due-badge">临期</span>
					) : null}
				</div>
				<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
					<MessageSquareIcon className="size-3.5 opacity-70" />
					评论 <strong className="font-semibold text-foreground">{data.comments.length}</strong>
				</span>
				<Popover>
					<PopoverTrigger
						render={
							<button
								type="button"
								className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
								aria-label="选择标签"
							>
								<TagIcon className="size-3.5 opacity-70" />
								标签 <strong className="font-semibold text-foreground">{data.labels.length}</strong>
							</button>
						}
					/>
					<PopoverPopup className="w-56 p-2">
						<p className="px-1 pb-1 text-xs text-muted-foreground">标签</p>
						{labels && labels.length > 0 ? (
							<ul className="space-y-0.5">
								{labels.map((label) => {
									const attached = data.labels.some((item) => item.id === label.id);
									return (
										<li key={label.id}>
											<button
												type="button"
												className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
												onClick={() => onToggleLabel(label.id, !attached)}
											>
												<span className="flex-1">{label.name}</span>
												{attached ? <span className="text-primary">✓</span> : null}
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<p className="px-1 py-2 text-xs text-muted-foreground">暂无标签，可在项目看板创建</p>
						)}
					</PopoverPopup>
				</Popover>
				<Popover>
					<PopoverTrigger
						render={
							<button
								type="button"
								className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
							>
								<MilestoneIcon className="size-3.5 opacity-70" />
								里程碑 <strong className="font-semibold text-foreground">{(data.milestones ?? []).length}</strong>
							</button>
						}
					/>
					<PopoverPopup className="w-56 p-2">
						<p className="px-1 pb-1 text-xs text-muted-foreground">里程碑</p>
						{milestones && milestones.length > 0 ? (
							<ul className="space-y-0.5">
								{milestones.map((milestone) => {
									const attached = (data.milestones ?? []).some((item) => item.id === milestone.id);
									return (
										<li key={milestone.id}>
											<button
												type="button"
												className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
												onClick={() => onToggleMilestone(milestone.id, !attached)}
											>
												<span className="flex-1">{milestone.name}</span>
												{attached ? <span className="text-primary">✓</span> : null}
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<p className="px-1 py-2 text-xs text-muted-foreground">暂无里程碑，可在项目看板创建</p>
						)}
					</PopoverPopup>
				</Popover>
				<span className="flex items-center gap-2 text-[13px] text-muted-foreground">
					<FlagIcon className="size-3.5 opacity-70" />
					状态 <strong className="font-semibold text-foreground">{data.columnName || "未设列"}</strong>
				</span>
			</div>
		</>
	);
}
