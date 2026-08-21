// 里程碑操作 hook（对齐 use-task-mutations）：建/改名/设截止/删除/关联任务，成功统一失效里程碑列表。
// 所有 mutation 风格收敛一处；attach 失效看板范围 + 该任务详情（此前不刷任务详情——不对称缺陷在此修复）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import {
	invalidateBoardScope,
	invalidateTask,
	queryKeys,
} from "@/hooks/query-keys";
import type { Milestone } from "@/types/board";

export function useMilestoneMutations(projectId: string) {
	const queryClient = useQueryClient();
	const invalidateMilestones = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.milestones(projectId) });

	const create = useMutation({
		meta: { feedback: { success: "里程碑已创建", errorTitle: "创建里程碑失败" } },
		mutationFn: (name: string) =>
			api<Milestone>(buildPath("projectMilestones", { id: projectId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateMilestones,
	});

	const rename = useMutation({
		meta: { feedback: { success: "里程碑已更新", errorTitle: "更新里程碑失败" } },
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Milestone>(buildPath("milestone", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateMilestones,
	});

	const updateDueDate = useMutation({
		meta: { feedback: { success: "里程碑截止日期已更新", errorTitle: "更新截止日期失败" } },
		mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) =>
			api<Milestone>(buildPath("milestone", { id }), {
				method: "PATCH",
				body: JSON.stringify({ dueDate }),
			}),
		onSuccess: invalidateMilestones,
	});

	const remove = useMutation({
		meta: { feedback: { success: "里程碑已删除", errorTitle: "删除里程碑失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("milestone", { id }), { method: "DELETE" }),
		onSuccess: invalidateMilestones,
	});

	const attach = useMutation({
		meta: { feedback: { success: "任务已关联里程碑", errorTitle: "关联里程碑失败" } },
		mutationFn: ({
			taskId,
			milestoneId,
		}: {
			taskId: string;
			milestoneId: string;
		}) =>
			api<void>(buildPath("taskMilestones", { taskId, milestoneId }), {
				method: "POST",
			}),
		onSuccess: (_data, { taskId }) => {
			// 关联既改里程碑进度，也改该任务详情展示的里程碑 + 看板；统一失效（realtime 会收敛跨窗口）。
			invalidateBoardScope(queryClient, projectId);
			invalidateTask(queryClient, taskId);
		},
	});

	return { create, rename, updateDueDate, remove, attach };
}
