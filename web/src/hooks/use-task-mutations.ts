// 任务操作 hook：建/改/删/移。移动（拖拽）含乐观更新与失败回滚（onMutate/onError）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import {
	invalidateTaskScope,
	queryKeys,
} from "@/hooks/query-keys";
import type { Board } from "@/types/board";
import type { Task } from "@/types/task";

export type TaskPatch = Partial<Pick<Task, "title" | "description" | "priority" | "dueDate">>;
export type UpdateTaskInput = { id: string } & TaskPatch;

// moveTaskInBoard 纯函数：把任务从源列移除、插入目标列的目标位置（越界收敛）。
export function moveTaskInBoard(
	board: Board,
	taskId: string,
	targetColumnId: string,
	targetPosition: number,
): Board {
	const sourceIdx = board.columns.findIndex((c) =>
		c.tasks.some((t) => t.id === taskId),
	);
	const targetIdx = board.columns.findIndex((c) => c.id === targetColumnId);
	if (sourceIdx < 0 || targetIdx < 0) return board;

	const dragged = board.columns[sourceIdx].tasks.find((t) => t.id === taskId);
	if (!dragged) return board;

	const columns = board.columns.map((c) => ({ ...c, tasks: [...c.tasks] }));
	columns[sourceIdx].tasks = columns[sourceIdx].tasks.filter(
		(t) => t.id !== taskId,
	);
	columns[targetIdx].tasks.splice(
		Math.min(targetPosition, columns[targetIdx].tasks.length),
		0,
		{
			...dragged,
			columnId: targetColumnId,
		},
	);
	return { ...board, columns };
}

// addTaskToBoard 纯函数：把新任务追加到目标列末尾（服务端创建即分配末尾 position），
// 用于 createTask 乐观插入，消除「添加后等 refetch 才出现」的延迟感。
export function addTaskToBoard(board: Board | undefined, task: Task): Board | undefined {
	if (!board) return board;
	if (!board.columns.some((c) => c.id === task.columnId)) return board;
	return {
		...board,
		columns: board.columns.map((c) =>
			c.id === task.columnId ? { ...c, tasks: [...c.tasks, task] } : c,
		),
	};
}
export function useTaskMutations(projectId: string, workspaceId = "") {
	const queryClient = useQueryClient();

	const createTask = useMutation({
		meta: { feedback: { success: "任务已创建", errorTitle: "创建任务失败" } },
		mutationFn: ({ columnId, title, priority }: { columnId: string; title: string; priority: string }) =>
			api<Task>(buildPath("columnTasks", { columnId }), {
				method: "POST",
				body: JSON.stringify({ title, priority }),
			}),
		onSuccess: (task) => {
			// 乐观插入：用服务端返回的任务立即写入缓存（无延迟感），invalidate 后台收敛。
			queryClient.setQueryData<Board>(
				queryKeys.board(projectId),
				(old) => addTaskToBoard(old, task),
			);
			invalidateTaskScope(queryClient, { projectId, workspaceId, taskId: task.id });
		},
	});

	const updateTask = useMutation({
		meta: { feedback: { success: "任务已更新", errorTitle: "更新任务失败" } },
		mutationFn: ({ id, ...patch }: UpdateTaskInput) =>
			api<Task>(buildPath("task", { id }), {
				method: "PATCH",
				body: JSON.stringify(patch),
			}),
		onSuccess: (_data, { id }) => {
			invalidateTaskScope(queryClient, { projectId, workspaceId, taskId: id });
		},
	});

	const deleteTask = useMutation({
		meta: { feedback: { success: "任务已删除", errorTitle: "删除任务失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("task", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateTaskScope(queryClient, { projectId, workspaceId }),
	});

	const setArchived = useMutation({
		meta: { feedback: { success: "任务状态已更新", errorTitle: "更新任务状态失败" } },
		mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
			api<Task>(buildPath(archived ? "taskArchive" : "taskRestore", { id }), { method: "POST" }),
		onSuccess: (_data, { id }) => {
			invalidateTaskScope(queryClient, { projectId, workspaceId, taskId: id });
		},
	});

	// 任务拖拽：乐观写入看板缓存，失败恢复快照，成功以 invalidate 收敛服务端 reindex。
	const moveTask = useMutation({
		meta: { feedback: { errorTitle: "移动任务失败" } },
		mutationFn: ({
			id,
			columnId,
			position,
		}: {
			id: string;
			columnId: string;
			position: number;
		}) =>
			api<void>(buildPath("task", { id }), {
				method: "PATCH",
				body: JSON.stringify({ columnId, position }),
			}),
		onMutate: async ({ id, columnId, position }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.board(projectId) });
			const previous = queryClient.getQueryData<Board>(
				queryKeys.board(projectId),
			);
			if (previous) {
				queryClient.setQueryData(
					queryKeys.board(projectId),
					moveTaskInBoard(previous, id, columnId, position),
				);
			}
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) {
				queryClient.setQueryData(queryKeys.board(projectId), ctx.previous);
			}
		},
		onSuccess: () => invalidateTaskScope(queryClient, { projectId, workspaceId }),
	});

	return { createTask, updateTask, deleteTask, setArchived, moveTask };
}
