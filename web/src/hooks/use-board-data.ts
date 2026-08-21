// 看板数据 hook：查询 + 看板结构操作（列 CRUD/移动 + 乐观更新/回滚）。
// 看板的"形状"（列及其顺序）属于看板数据本身，故列操作与查询同处一室（locality）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateBoard, queryKeys } from "@/hooks/query-keys";
import type { Board, Column } from "@/types/board";

// moveColumnInBoard 纯函数：把列移到目标位置（越界收敛），返回新看板。
export function moveColumnInBoard(
	board: Board,
	columnId: string,
	targetPosition: number,
): Board {
	const oldIndex = board.columns.findIndex((c) => c.id === columnId);
	if (oldIndex < 0) return board;
	const newIndex = Math.min(
		Math.max(targetPosition, 0),
		board.columns.length - 1,
	);
	const columns = [...board.columns];
	const [moved] = columns.splice(oldIndex, 1);
	columns.splice(newIndex, 0, moved);
	return { ...board, columns };
}

export function useBoardData(projectId: string) {
	const queryClient = useQueryClient();

	const boardQuery = useQuery({
		queryKey: queryKeys.board(projectId),
		queryFn: () => api<Board>(buildPath("project", { id: projectId })),
		enabled: projectId !== "",
	});

	const createColumn = useMutation({
		meta: { feedback: { success: "列已创建", errorTitle: "创建列失败" } },
		mutationFn: (name: string) =>
			api<Column>(buildPath("projectColumns", { projectId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const renameColumn = useMutation({
		meta: { feedback: { success: "列已更新", errorTitle: "更新列失败" } },
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Column>(buildPath("column", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const deleteColumn = useMutation({
		meta: { feedback: { success: "列已删除", errorTitle: "删除列失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("column", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	// 列拖拽：乐观更新 + 失败回滚。
	const moveColumn = useMutation({
		meta: { feedback: { success: "列顺序已更新", errorTitle: "移动列失败" } },
		mutationFn: ({ id, position }: { id: string; position: number }) =>
			api<void>(buildPath("column", { id }), {
				method: "PATCH",
				body: JSON.stringify({ position }),
			}),
		onMutate: async ({ id, position }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.board(projectId) });
			const previous = queryClient.getQueryData<Board>(
				queryKeys.board(projectId),
			);
			if (previous) {
				queryClient.setQueryData(
					queryKeys.board(projectId),
					moveColumnInBoard(previous, id, position),
				);
			}
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) {
				queryClient.setQueryData(queryKeys.board(projectId), ctx.previous);
			}
		},
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	return {
		board: boardQuery.data,
		isLoading: boardQuery.isLoading,
		isError: boardQuery.isError,
		columnOps: { createColumn, renameColumn, deleteColumn, moveColumn },
	};
}
