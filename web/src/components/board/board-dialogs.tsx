import { lazy, Suspense, useState } from "react";
import { ArchiveIcon, PencilIcon } from "lucide-react";
import DatePicker from "@/components/date-picker";
import { MilestoneDeleteButton } from "@/components/board/board-milestones";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogDescription,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { progressPct } from "@/lib/milestone-progress";
import type { Board, Milestone } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

const LabelManagerDialog = lazy(() => import("@/components/label-manager"));
const ShareMilestoneDialog = lazy(() => import("@/components/share-milestone-dialog"));
const MilestoneDetailDialog = lazy(() => import("@/components/milestone-detail-dialog"));

type BoardDialogsProps = {
	board: Board | undefined;
	workspaceId: string;
	projectId: string;
	deleting: Board["columns"][number] | null;
	setDeleting: (column: Board["columns"][number] | null) => void;
	createOpen: boolean;
	setCreateOpen: (open: boolean) => void;
	onCreateColumn: (name: string) => Promise<void>;
	onDeleteColumn: () => Promise<void>;
	editingTask: Task | null;
	setEditingTask: (task: Task | null) => void;
	onUpdateTask: (name: string) => Promise<void>;
	labelManagerOpen: boolean;
	setLabelManagerOpen: (open: boolean) => void;
	labels: Label[];
	onCreateLabel: (name: string) => Promise<void>;
	onRenameLabel: (id: string, name: string) => Promise<void>;
	onDeleteLabel: (id: string) => Promise<void>;
	archiveOpen: boolean;
	setArchiveOpen: (open: boolean) => void;
	archivedTasks: Task[] | undefined;
	archivedLoading: boolean;
	archivedError: boolean;
	onRestoreTask: (task: Task) => void;
	onDeleteArchivedTask: (task: Task) => void;
	milestoneOpen: boolean;
	setMilestoneOpen: (open: boolean) => void;
	milestones: Milestone[] | undefined;
	newMilestone: string;
	setNewMilestone: (value: string) => void;
	onCreateMilestone: (name: string) => void;
	editingMilestone: { id: string; name: string } | null;
	setEditingMilestone: (value: { id: string; name: string } | null) => void;
	onRenameMilestone: (id: string, name: string) => Promise<unknown>;
	onUpdateMilestoneDueDate: (id: string, dueDate: string) => Promise<unknown>;
	onDeleteMilestone: (milestone: Milestone) => void;
	shareOpen: boolean;
	setShareOpen: (open: boolean) => void;
	detailMilestone: Milestone | null;
	setDetailMilestone: (milestone: Milestone | null) => void;
};

export function BoardDialogs(props: BoardDialogsProps) {
	const {
		board,
		workspaceId,
		projectId,
		deleting,
		setDeleting,
		createOpen,
		setCreateOpen,
		onCreateColumn,
		onDeleteColumn,
		editingTask,
		setEditingTask,
		onUpdateTask,
		labelManagerOpen,
		setLabelManagerOpen,
		labels,
		onCreateLabel,
		onRenameLabel,
		onDeleteLabel,
		archiveOpen,
		setArchiveOpen,
		archivedTasks,
		archivedLoading,
		archivedError,
		onRestoreTask,
		onDeleteArchivedTask,
		milestoneOpen,
		setMilestoneOpen,
		milestones,
		newMilestone,
		setNewMilestone,
		onCreateMilestone,
		editingMilestone,
		setEditingMilestone,
		onRenameMilestone,
		onUpdateMilestoneDueDate,
		onDeleteMilestone,
		shareOpen,
		setShareOpen,
		detailMilestone,
		setDetailMilestone,
	} = props;

	return (
		<>
			<NameDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="新建列"
				description="新列将追加到看板末尾。"
				submitLabel="创建"
				onSubmit={onCreateColumn}
			/>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="删除列"
				description={`确定删除列"${deleting?.name ?? ""}"吗？其下任务将一并删除，此操作不可撤销。`}
				onConfirm={onDeleteColumn}
			/>
			<NameDialog
				open={editingTask !== null}
				onOpenChange={(open) => {
					if (!open) setEditingTask(null);
				}}
				title="编辑任务"
				description="修改任务标题。"
				submitLabel="保存"
				initialValue={editingTask?.title ?? ""}
				onSubmit={onUpdateTask}
			/>
			{labelManagerOpen ? (
				<Suspense fallback={null}>
					<LabelManagerDialog
						open
						onOpenChange={setLabelManagerOpen}
						labels={labels}
						onCreate={onCreateLabel}
						onRename={onRenameLabel}
						onDelete={onDeleteLabel}
					/>
				</Suspense>
			) : null}
			<Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
				<DialogPortal>
					<DialogBackdrop />
					<DialogPopup>
						<DialogHeader>
							<DialogTitle>归档任务</DialogTitle>
							<DialogDescription>归档任务从看板隐藏，但仍可搜索和恢复。</DialogDescription>
						</DialogHeader>
						<DialogPanel>
							{archivedLoading ? <p className="kanso-loading py-8 text-center text-xs">加载归档任务…</p> : null}
							{archivedError ? <p className="kanso-error py-8 text-center text-xs">加载归档任务失败</p> : null}
							{!archivedLoading && !archivedError && (archivedTasks?.length ?? 0) === 0 ? (
								<div className="kanso-empty-state min-h-24 text-xs">暂无归档任务</div>
							) : null}
							<ul className="space-y-2">
								{archivedTasks?.map((task) => (
									<li key={task.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
										<ArchiveIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
										<div className="flex items-center gap-2">
											<Button size="sm" variant="outline" onClick={() => onRestoreTask(task)}>恢复</Button>
											<ArchiveDeleteButton task={task} onDelete={onDeleteArchivedTask} />
										</div>
									</li>
								))}
							</ul>
						</DialogPanel>
					</DialogPopup>
				</DialogPortal>
			</Dialog>
			<Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
				<DialogPortal>
					<DialogBackdrop />
					<DialogPopup>
						<DialogHeader>
							<DialogTitle>里程碑</DialogTitle>
							<DialogDescription>项目阶段节点 · 进度按任务位置推导</DialogDescription>
						</DialogHeader>
						<DialogPanel>
							<form
								className="mb-4 flex gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									if (newMilestone.trim()) {
										onCreateMilestone(newMilestone.trim());
										setNewMilestone("");
									}
								}}
							>
								<input className="kanso-input min-w-0 flex-1 rounded-md border px-3 text-sm" value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="新里程碑名称" />
								<Button type="submit">创建</Button>
							</form>
							<div className="space-y-2">
								{milestones?.map((milestone) => {
									const pct = progressPct(milestone);
									const editing = editingMilestone?.id === milestone.id;
									return (
										<div key={milestone.id} className="group flex items-center gap-2.5 rounded-md border border-border px-3 py-2">
											{editing ? (
												<input
													autoFocus
													defaultValue={milestone.name}
													aria-label="重命名里程碑"
													className="kanso-input min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
													onKeyDown={(event) => {
														const name = event.currentTarget.value.trim();
														if (event.key === "Enter" && name) void onRenameMilestone(milestone.id, name).then(() => setEditingMilestone(null));
														if (event.key === "Escape") setEditingMilestone(null);
													}}
													onBlur={(event) => {
														const name = event.currentTarget.value.trim();
														if (name && name !== milestone.name) void onRenameMilestone(milestone.id, name).then(() => setEditingMilestone(null));
														else setEditingMilestone(null);
													}}
												/>
											) : (
												<span className="min-w-0 flex-1 truncate text-sm">{milestone.name}</span>
											)}
											<span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
											<span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{milestone.progress ? `${pct}%` : "—"}</span>
											<DatePicker value={milestone.dueDate ?? ""} onChange={(date) => void onUpdateMilestoneDueDate(milestone.id, date)} ariaLabel="里程碑截止日期" placeholder="设置日期" />
											<button type="button" aria-label={`重命名 ${milestone.name}`} title="重命名" className="text-muted-foreground hover:text-foreground" onClick={() => setEditingMilestone({ id: milestone.id, name: milestone.name })}><PencilIcon className="size-3.5" /></button>
											<MilestoneDeleteButton milestone={milestone} onDelete={onDeleteMilestone} className="text-muted-foreground hover:text-destructive" />
										</div>
									);
								})}
							</div>
						</DialogPanel>
					</DialogPopup>
				</DialogPortal>
			</Dialog>
			{shareOpen ? (
				<Suspense fallback={null}>
					<ShareMilestoneDialog open onOpenChange={setShareOpen} projectName={board?.project.name ?? ""} milestones={milestones ?? []} />
				</Suspense>
			) : null}
			{detailMilestone ? (
				<Suspense fallback={null}>
					<MilestoneDetailDialog
						open
						onOpenChange={(open) => {
							if (!open) setDetailMilestone(null);
						}}
						milestone={milestones?.find((milestone) => milestone.id === detailMilestone.id) ?? detailMilestone}
						workspaceId={workspaceId}
						projectId={projectId}
					/>
				</Suspense>
			) : null}
		</>
	);
}

function ArchiveDeleteButton(props: { task: Task; onDelete: (task: Task) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button size="sm" variant="destructive">删除</Button>} />
			<PopoverPopup className="w-52 p-2" align="end">
				<div className="space-y-2 p-1">
					<p className="break-words text-xs leading-relaxed text-muted-foreground">永久删除「{props.task.title}」？此操作不可撤销。</p>
					<div className="flex justify-end gap-2">
						<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
						<Button size="sm" variant="destructive" onClick={() => { setOpen(false); props.onDelete(props.task); }}>删除</Button>
					</div>
				</div>
			</PopoverPopup>
		</Popover>
	);
}
