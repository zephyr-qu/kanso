// 项目置顶（后端持久化 project.pinned）：查询始终限定当前工作区。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidatePinnedProjects, queryKeys } from "@/hooks/query-keys";
import type { PinnedProject } from "@/types/pinned-project";

export type { PinnedProject } from "@/types/pinned-project";

export function usePinnedProjects(workspaceId: string) {
	const queryClient = useQueryClient();
	const { data: items = [] } = useQuery({
		queryKey: queryKeys.pinnedProjects(workspaceId),
		queryFn: () => api<PinnedProject[]>(buildPath("pinnedProjects", { workspaceId })),
		enabled: Boolean(workspaceId),
	});

	const setPinned = useMutation({
		meta: { feedback: { success: "置顶状态已更新", errorTitle: "更新置顶状态失败" } },
		mutationFn: ({ projectId, pinned }: { projectId: string; pinned: boolean }) =>
			api<void>(buildPath("setProjectPinned", { id: projectId }), {
				method: "POST",
				body: JSON.stringify({ pinned }),
			}),
		onSuccess: () => invalidatePinnedProjects(queryClient, workspaceId),
	});

	const toggle = (projectId: string) => {
		const pinned = !items.some((x) => x.projectId === projectId);
		setPinned.mutate({ projectId, pinned });
	};

	const isPinned = (projectId: string) =>
		items.some((x) => x.projectId === projectId);

	return { items, toggle, isPinned };
}
