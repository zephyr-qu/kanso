// 标签操作 hook：建/改/删/贴摘。toggleLabel 统一为 useMutation（此前是裸 api 调用）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateBoard } from "@/hooks/query-keys";
import type { Label } from "@/types/label";

export function useLabelMutations(projectId: string) {
	const queryClient = useQueryClient();

	// workspaceId 在调用时从看板缓存读取（保证缓存加载后再建标签也有正确的工作区）。
	// 标签属于项目：创建直接打到项目端点。
	const createLabel = useMutation({
		mutationFn: ({ name }: { name: string }) =>
			api<Label>(buildPath("projectLabels", { projectId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const renameLabel = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Label>(buildPath("label", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	const deleteLabel = useMutation({
		mutationFn: (id: string) =>
			api<void>(buildPath("label", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	// 贴/摘标签：方向由调用方显式给出（attach=true 贴 / false 摘），成功后失效看板（徽章刷新）。
	// 拖拽状态机的 toggleLabel 命令与任务卡弹层共用此签名——不再从 task.labels 反推方向（避免隐式状态）。
	const toggleLabel = useMutation({
		mutationFn: ({ taskId, labelId, attach }: { taskId: string; labelId: string; attach: boolean }) =>
			api<void>(buildPath("taskLabels", { taskId, labelId }), {
				method: attach ? "POST" : "DELETE",
			}),
		onSuccess: () => invalidateBoard(queryClient, projectId),
	});

	return { createLabel, renameLabel, deleteLabel, toggleLabel };
}
