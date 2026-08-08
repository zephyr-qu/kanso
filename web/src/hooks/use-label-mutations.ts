// 标签操作 hook：建/改/删/贴摘。toggleLabel 统一为 useMutation（此前是裸 api 调用）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateBoard, queryKeys } from "@/hooks/query-keys";
import type { Board } from "@/types/board";
import type { Label } from "@/types/label";
import type { Task } from "@/types/task";

export function useLabelMutations(projectId: string) {
	const queryClient = useQueryClient();

	// workspaceId 在调用时从看板缓存读取（保证缓存加载后再建标签也有正确的工作区）。
	const createLabel = useMutation({
		mutationFn: ({ name, color }: { name: string; color: string }) => {
			const workspaceId =
				queryClient.getQueryData<Board>(queryKeys.board(projectId))?.project
					.workspaceId ?? "";
			return api<Label>(`/api/workspaces/${workspaceId}/labels`, {
				method: "POST",
				body: JSON.stringify({ name, color }),
			});
		},
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const renameLabel = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Label>(`/api/labels/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const deleteLabel = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/labels/${id}`, { method: "DELETE" }),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	// 贴/摘标签：按当前状态决定 POST/DELETE，成功后失效看板（徽章刷新）。
	const toggleLabel = useMutation({
		mutationFn: ({ task, label }: { task: Task; label: Label }) => {
			const attached = (task.labels ?? []).some((l) => l.id === label.id);
			return api<void>(`/api/tasks/${task.id}/labels/${label.id}`, {
				method: attached ? "DELETE" : "POST",
			});
		},
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	return { createLabel, renameLabel, deleteLabel, toggleLabel };
}
