// 标签操作 hook：建/改/删/贴摘。toggleLabel 统一为 useMutation（此前是裸 api 调用）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateProjectScope, invalidateTaskScope } from "@/hooks/query-keys";
import type { Label } from "@/types/label";

export function useLabelMutations(projectId: string, workspaceId = "") {
	const queryClient = useQueryClient();

	// 标签属于项目；显式 workspaceId 让聚合查询只失效当前工作区。
	const createLabel = useMutation({
		meta: { feedback: { success: "标签已创建", errorTitle: "创建标签失败" } },
		mutationFn: ({ name }: { name: string }) =>
			api<Label>(buildPath("projectLabels", { projectId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateProjectScope(queryClient, { projectId, workspaceId }),
	});

	const renameLabel = useMutation({
		meta: { feedback: { success: "标签已更新", errorTitle: "更新标签失败" } },
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Label>(buildPath("label", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: () => invalidateProjectScope(queryClient, { projectId, workspaceId }),
	});

	const deleteLabel = useMutation({
		meta: { feedback: { success: "标签已删除", errorTitle: "删除标签失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("label", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateProjectScope(queryClient, { projectId, workspaceId }),
	});

	// 贴/摘标签：方向由调用方显式给出（attach=true 贴 / false 摘），成功后失效看板（徽章刷新）。
	// 拖拽状态机的 toggleLabel 命令与任务卡弹层共用此签名——不再从 task.labels 反推方向（避免隐式状态）。
	const toggleLabel = useMutation({
		meta: { feedback: { errorTitle: "更新任务标签失败" } },
		mutationFn: ({ taskId, labelId, attach }: { taskId: string; labelId: string; attach: boolean }) =>
			api<void>(buildPath("taskLabels", { taskId, labelId }), {
				method: attach ? "POST" : "DELETE",
			}),
		onSuccess: (_data, { taskId }) =>
			invalidateTaskScope(queryClient, { projectId, workspaceId, taskId }),
	});

	return { createLabel, renameLabel, deleteLabel, toggleLabel };
}
