// 评论操作 hook：建/改/删。评论只改变任务详情，因此缓存失效集中在任务详情查询。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateTask } from "@/hooks/query-keys";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import type { Comment } from "@/types/task-detail";

export function useCommentMutations(taskId: string) {
	const queryClient = useQueryClient();

	const create = useMutation({
		meta: { feedback: { success: "评论已发布", errorTitle: "发表评论失败" } },
		mutationFn: (content: string) =>
			api<Comment>(buildPath("taskComments", { id: taskId }), {
				method: "POST",
				body: JSON.stringify({ content }),
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const update = useMutation({
		meta: { feedback: { success: "评论已更新", errorTitle: "更新评论失败" } },
		mutationFn: ({ id, content }: { id: string; content: string }) =>
			api<Comment>(buildPath("comment", { id }), {
				method: "PATCH",
				body: JSON.stringify({ content }),
			}),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	const remove = useMutation({
		meta: { feedback: { success: "评论已删除", errorTitle: "删除评论失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("comment", { id }), { method: "DELETE" }),
		onSuccess: () => invalidateTask(queryClient, taskId),
	});

	return { create, update, remove };
}
