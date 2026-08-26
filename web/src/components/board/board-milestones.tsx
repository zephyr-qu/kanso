import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";
import { progressPct } from "@/lib/milestone-progress";
import type { Milestone } from "@/types/board";
import type { MilestoneLinkState } from "@/hooks/use-milestone-link";

type BoardMilestonesProps = {
	milestones: Milestone[] | undefined;
	onShare: () => void;
	onSelect: (milestone: Milestone) => void;
	startLink: (event: ReactPointerEvent, milestoneId: string) => void;
	clearLink: () => void;
	suppressClickRef: { current: boolean };
	onDelete: (milestone: Milestone) => void;
	milestoneLink: MilestoneLinkState | null;
};

export function BoardMilestones({
	milestones,
	onShare,
	onSelect,
	startLink,
	clearLink,
	suppressClickRef,
	onDelete,
	milestoneLink,
}: BoardMilestonesProps) {
	return (
		<>
			{milestones && milestones.length > 0 ? (
				<div className="mb-3">
					<div className="mb-1.5 flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground">里程碑进度</span>
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground"
							onClick={onShare}
						>
							分享进度
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						{milestones.map((milestone) => {
							const pct = progressPct(milestone);
							return (
								<div
									key={milestone.id}
									role="button"
									tabIndex={0}
									onClick={() => {
										if (suppressClickRef.current) {
											suppressClickRef.current = false;
											return;
										}
									onSelect(milestone);
									}}
									onPointerDown={(event) => startLink(event, milestone.id)}
									onPointerUp={clearLink}
									onKeyDown={(event) => {
										if (event.key === "Enter") onSelect(milestone);
									}}
									className="kanso-surface-card group relative flex w-40 flex-col gap-1 p-3 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
								>
									<MilestoneDeleteButton
										milestone={milestone}
										onDelete={onDelete}
										className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
									/>
									<span className="truncate pr-4 text-sm font-medium">{milestone.name}</span>
									<span className="text-[11px] text-muted-foreground">
										{milestone.dueDate ? `截止 ${milestone.dueDate}` : "未设截止"}
									</span>
									<span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
									</span>
									<span className="text-[11px] text-muted-foreground">{pct}% 完成</span>
								</div>
							);
						})}
					</div>
				</div>
			) : milestones ? (
				<div className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
					暂无里程碑，点击右上角「里程碑」创建。
				</div>
			) : null}
			{milestoneLink
				? createPortal(
						<svg className="pointer-events-none fixed left-0 top-0 z-[120] h-screen w-screen">
							<line
								x1={milestoneLink.fromX}
								y1={milestoneLink.fromY}
								x2={milestoneLink.curX}
								y2={milestoneLink.curY}
								stroke="#c2410c"
								strokeWidth={2}
								strokeDasharray="5 4"
							/>
							<circle
								cx={milestoneLink.curX}
								cy={milestoneLink.curY}
								r={5}
								fill={milestoneLink.targetTaskId ? "#c2410c" : "rgba(194,65,12,.45)"}
							/>
						</svg>,
						document.body,
				  )
				: null}
		</>
	);
}

export function MilestoneDeleteButton(props: {
	milestone: Milestone;
	onDelete: (milestone: Milestone) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={`删除里程碑 ${props.milestone.name}`}
						title="删除里程碑"
						className={props.className ?? ""}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => event.stopPropagation()}
					>
						<TrashIcon className="size-3.5" />
					</button>
				}
			/>
			<PopoverPopup className="w-52 p-2" align="end">
				<div className="space-y-2 p-1">
					<p className="break-words text-xs leading-relaxed text-muted-foreground">
						删除里程碑「{props.milestone.name}」？其关联任务将一并解除，此操作不可撤销。
					</p>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								setOpen(false);
								props.onDelete(props.milestone);
							}}
						>
							删除
						</Button>
					</div>
				</div>
			</PopoverPopup>
		</Popover>
	);
}
