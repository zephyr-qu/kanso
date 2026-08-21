// 项目置顶（后端持久化 project.pinned）：跨设备同步、重命名/删除随项目实时。
// 侧边栏"置顶"分组、项目卡与看板标题图钉共用此查询。类型见 types/pinned-project.ts（ADR-0009）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import type { PinnedProject } from "@/types/pinned-project";

export type { PinnedProject } from "@/types/pinned-project";

const KEY = ["pinned-projects"] as const;

export function usePinnedProjects() {
	const queryClient = useQueryClient();
	const { data: items = [] } = useQuery({
		queryKey: KEY,
		queryFn: () => api<PinnedProject[]>(buildPath("pinnedProjects")),
	});

	const setPinned = useMutation({
		meta: { feedback: { success: "置顶状态已更新", errorTitle: "更新置顶状态失败" } },
		mutationFn: ({ projectId, pinned }: { projectId: string; pinned: boolean }) =>
			api<void>(buildPath("setProjectPinned", { id: projectId }), {
				method: "POST",
				body: JSON.stringify({ pinned }),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
	});

	const toggle = (projectId: string) => {
		const pinned = !items.some((x) => x.projectId === projectId);
		setPinned.mutate({ projectId, pinned });
	};

	const isPinned = (projectId: string) =>
		items.some((x) => x.projectId === projectId);

	return { items, toggle, isPinned };
}
