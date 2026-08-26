// 看板页：编排与渲染。数据/缓存/乐观更新逻辑都在领域 hooks 里（架构候选 1）。
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type Announcements,
	type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Outlet, useNavigate, useParams } from "react-router";
import { BoardCanvas } from "@/components/board/board-canvas";
import { BoardMilestones } from "@/components/board/board-milestones";
import { recordProjectOpen } from "@/lib/recent-projects";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useBoardData } from "@/hooks/use-board-data";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useLabelMutations } from "@/hooks/use-label-mutations";
import { useMilestoneMutations } from "@/hooks/use-milestone-mutations";
import { useMilestoneLink } from "@/hooks/use-milestone-link";
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { useBoardDrag, swimlaneGroups } from "@/hooks/use-board-drag";
import { overSignal } from "@/lib/board-dnd";
import type { Board, BoardColumn, Milestone } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";
import type { Workspace } from "@/types/workspace";
import { PageContent } from "@/components/kanso-ui";
import { BoardToolbar } from "@/components/board/board-toolbar";

const BoardDialogs = lazy(() =>
	import("@/components/board/board-dialogs").then(({ BoardDialogs: Dialogs }) => ({
		default: Dialogs,
	})),
);

export default function BoardPage() {
	const { projectId = "", workspaceId = "" } = useParams();

	// 打开项目即记录"最近打开"，供仪表盘"项目速览"展示。
	useEffect(() => {
		if (workspaceId && projectId) recordProjectOpen(workspaceId, projectId);
	}, [workspaceId, projectId]);
	const navigate = useNavigate();
	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});
	const workspaceName =
		workspaces?.find((workspace) => workspace.id === workspaceId)?.name ??
		"工作区";

	const [createOpen, setCreateOpen] = useState(false);
	const [deleting, setDeleting] = useState<BoardColumn | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [labelManagerOpen, setLabelManagerOpen] = useState(false);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"columns" | "swimlane">("columns");
	const [milestoneOpen, setMilestoneOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [detailMilestone, setDetailMilestone] = useState<Milestone | null>(null);
	const [newMilestone, setNewMilestone] = useState("");
	// 里程碑行内编辑/删除状态。
	const [editingMilestone, setEditingMilestone] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);
	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	// 显示层排序（按项目持久化到 localStorage，刷新保持）：不改写 position。
	const { sort: sortConfig, setSort: setSortConfig } = useBoardSort(projectId);
	const { board, isLoading, isError, columnOps } = useBoardData(projectId);
	const swimlanes = useMemo(
		() => (board ? swimlaneGroups(board) : []),
		[board],
	);
	const taskOps = useTaskMutations(projectId);
	const labelOps = useLabelMutations(projectId);
	// 拖拽状态机（useBoardDrag）：视觉状态 + dragend 提交计划，纯函数在 hooks/use-board-drag.ts。
	const {
		dragState,
		activeTask,
		dragActiveTaskId,
		activeTaskColumnId,
		onDragStart,
		onDragOver,
		onDragEnd,
		onDragCancel,
	} = useBoardDrag(board, viewMode);
	const archivedQuery = useQuery({
		queryKey: queryKeys.archivedTasks(projectId),
		queryFn: () =>
			api<Task[]>(buildPath("projectArchivedTasks", { id: projectId })),
		enabled: archiveOpen && projectId !== "",
	});
	const milestonesQuery = useQuery({
		queryKey: queryKeys.milestones(projectId),
		queryFn: () =>
			api<Milestone[]>(buildPath("projectMilestones", { id: projectId })),
		enabled: projectId !== "",
	});
	// 里程碑所有操作收敛到领域 hook（建/改名/设截止/删除/关联，成功统一失效列表）。
	const milestoneOps = useMilestoneMutations(projectId);
	const { milestoneLink, startMilestoneLink, clearLinkPress, suppressClickRef } =
		useMilestoneLink((taskId, milestoneId) =>
			milestoneOps.attach.mutate({ taskId, milestoneId }),
		);

	// 实时：其他窗口的写操作经 WS 推送后 invalidate 本页查询。
	useRealtime(projectId, { deferInvalidation: dragState.activeId !== null });

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			// Space 开始键盘拖拽；Enter 留给任务卡根节点打开详情（卡片同时是拖拽激活面）。
			keyboardCodes: {
				start: ["Space"],
				cancel: ["Escape"],
				end: ["Space", "Enter", "Tab"],
			},
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// dragend：状态机产出提交计划，这里只做 命令 → mutation 的映射（列/任务/标签各归其 hook）。
	function handleDragEnd(event: DragEndEvent) {
		const { overId, overType, halfPassed } = overSignal(event);
		const commands = onDragEnd(
			String(event.active.id),
			overId,
			overType,
			halfPassed,
		);
		for (const command of commands) {
			if (command.type === "moveTask") {
				taskOps.moveTask.mutate({
					id: command.id,
					columnId: command.columnId,
					position: command.position,
				});
			} else if (command.type === "moveColumn") {
				columnOps.moveColumn.mutate({ id: command.id, position: command.position });
			} else if (command.type === "toggleLabel") {
				labelOps.toggleLabel.mutate({
					taskId: command.taskId,
					labelId: command.labelId,
					attach: command.attach,
				});
			}
		}
	}

	const handleRenameColumn = useCallback(
		(column: BoardColumn, name: string) => {
			void columnOps.renameColumn.mutateAsync({ id: column.id, name });
		},
		[columnOps.renameColumn],
	);
	const handleAddTask = useCallback(
		(columnId: string, title: string, priority: string) => {
			taskOps.createTask.mutate({ columnId, title, priority });
		},
		[taskOps.createTask],
	);
	const handleOpenTask = useCallback(
		(task: Task) => {
			navigate(
				`/w/${board?.project.workspaceId ?? ""}/p/${projectId}/t/${task.id}`,
			);
		},
		[navigate, board?.project.workspaceId, projectId],
	);
	const handleArchiveTask = useCallback(
		(task: Task) => {
			taskOps.setArchived.mutate({ id: task.id, archived: true });
		},
		[taskOps.setArchived],
	);
	const handleToggleLabel = useCallback(
		(task: Task, label: Label) => {
			labelOps.toggleLabel.mutate({
				taskId: task.id,
				labelId: label.id,
				attach: !(task.labels ?? []).some((item) => item.id === label.id),
			});
		},
		[labelOps.toggleLabel],
	);
	const announcements: Announcements = {
		onDragStart: ({ active }) => {
			const task = board?.columns
				.flatMap((column) => column.tasks)
				.find((item) => item.id === String(active.id));
			const column = board?.columns.find((item) => item.id === String(active.id));
			return task
				? `已抓取任务「${task.title}」，按方向键移动，按空格放下，按 Escape 取消。`
				: column
					? `已抓取列「${column.name}」，按左右方向键移动，按空格放下，按 Escape 取消。`
					: "已开始拖拽。";
		},
		onDragOver: ({ active, over }) => {
			if (!over) return "已离开放置区域。";
			const targetColumn = board?.columns.find(
				(column) =>
					column.id === String(over.id) ||
					column.tasks.some((task) => task.id === String(over.id)),
			);
			const task = board?.columns
				.flatMap((column) => column.tasks)
				.find((item) => item.id === String(active.id));
			return targetColumn
				? `任务「${task?.title ?? String(active.id)}」已移动到「${targetColumn.name}」。`
				: `已移动到「${String(over.id)}」。`;
		},
		onDragEnd: ({ active, over }) => {
			if (!over) return "拖拽已结束，未改变位置。";
			const targetColumn = board?.columns.find(
				(column) =>
					column.id === String(over.id) ||
					column.tasks.some((task) => task.id === String(over.id)),
			);
			const task = board?.columns
				.flatMap((column) => column.tasks)
				.find((item) => item.id === String(active.id));
			return targetColumn
				? `任务「${task?.title ?? String(active.id)}」已放入「${targetColumn.name}」。`
				: "拖拽已完成。";
		},
		onDragCancel: () => "拖拽已取消，任务位置未改变。",
	};
	return (
		<div className="flex h-full flex-col">
			<BoardToolbar
				board={board}
				workspaceName={workspaceName}
				projectId={projectId}
				sortConfig={sortConfig}
				setSortConfig={setSortConfig}
				viewMode={viewMode}
				setViewMode={setViewMode}
				setCreateOpen={setCreateOpen}
				setLabelManagerOpen={setLabelManagerOpen}
				setArchiveOpen={setArchiveOpen}
				setMilestoneOpen={setMilestoneOpen}
			/>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : isError ? (
				<p className="py-16 text-center text-sm text-destructive">加载看板失败</p>
			) : board && board.columns.length > 0 ? (
				<PageContent className="kanso-board-content overflow-auto px-[26px] pb-7 pt-5">
					<BoardMilestones
						milestones={milestonesQuery.data}
						onShare={() => setShareOpen(true)}
						onSelect={setDetailMilestone}
						startLink={startMilestoneLink}
						clearLink={clearLinkPress}
						suppressClickRef={suppressClickRef}
						onDelete={(milestone) => {
							void milestoneOps.remove.mutateAsync(milestone.id);
						}}
						milestoneLink={milestoneLink}
					/>
					<BoardCanvas
						board={board}
						viewMode={viewMode}
						swimlanes={swimlanes}
						dragState={dragState}
						activeTask={activeTask}
						dragActiveTaskId={dragActiveTaskId}
						activeTaskColumnId={activeTaskColumnId}
						reducedMotion={reducedMotion}
						sensors={sensors}
						announcements={announcements}
						onDragStart={onDragStart}
						onDragOver={onDragOver}
						onDragEnd={handleDragEnd}
						onDragCancel={onDragCancel}
						sortConfig={sortConfig}
						onRename={handleRenameColumn}
						onDelete={setDeleting}
						onAddTask={handleAddTask}
						onOpenTask={handleOpenTask}
						onArchiveTask={handleArchiveTask}
						onToggleLabel={handleToggleLabel}
						onEditTask={setEditingTask}
					/>
				</PageContent>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>看板还没有列</EmptyTitle>
						<EmptyDescription>
							点击右上角"新建列"开始组织你的工作流。
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}


			<Suspense fallback={null}>
			<BoardDialogs
				board={board}
				workspaceId={workspaceId}
				projectId={projectId}
				deleting={deleting}
				setDeleting={setDeleting}
				createOpen={createOpen}
				setCreateOpen={setCreateOpen}
				onCreateColumn={async (name) => {
					await columnOps.createColumn.mutateAsync(name);
				}}
				onDeleteColumn={async () => {
					if (deleting) await columnOps.deleteColumn.mutateAsync(deleting.id);
				}}
				editingTask={editingTask}
				setEditingTask={setEditingTask}
				onUpdateTask={async (name) => {
					if (editingTask) await taskOps.updateTask.mutateAsync({ id: editingTask.id, title: name });
				}}
				labelManagerOpen={labelManagerOpen}
				setLabelManagerOpen={setLabelManagerOpen}
				labels={board?.labels ?? []}
				onCreateLabel={async (name) => {
					await labelOps.createLabel.mutateAsync({ name });
				}}
				onRenameLabel={async (id, name) => {
					await labelOps.renameLabel.mutateAsync({ id, name });
				}}
				onDeleteLabel={async (id) => {
					await labelOps.deleteLabel.mutateAsync(id);
				}}
				archiveOpen={archiveOpen}
				setArchiveOpen={setArchiveOpen}
				archivedTasks={archivedQuery.data}
				archivedLoading={archivedQuery.isLoading}
				archivedError={archivedQuery.isError}
				onRestoreTask={(task) => taskOps.setArchived.mutate({ id: task.id, archived: false })}
				onDeleteArchivedTask={(task) => taskOps.deleteTask.mutate(task.id)}
				milestoneOpen={milestoneOpen}
				setMilestoneOpen={setMilestoneOpen}
				milestones={milestonesQuery.data}
				newMilestone={newMilestone}
				setNewMilestone={setNewMilestone}
				onCreateMilestone={(name) => void milestoneOps.create.mutateAsync(name)}
				editingMilestone={editingMilestone}
				setEditingMilestone={setEditingMilestone}
				onRenameMilestone={(id, name) => milestoneOps.rename.mutateAsync({ id, name })}
				onUpdateMilestoneDueDate={(id, dueDate) => milestoneOps.updateDueDate.mutateAsync({ id, dueDate })}
				onDeleteMilestone={(milestone) => void milestoneOps.remove.mutateAsync(milestone.id)}
				shareOpen={shareOpen}
				setShareOpen={setShareOpen}
				detailMilestone={detailMilestone}
				setDetailMilestone={setDetailMilestone}
			/>
			</Suspense>

			{/* 子路由：任务详情右侧抽屉（fixed 覆盖在看板之上） */}
			<Outlet />
		</div>
	);
}
