// 工作区页：项目列表 + 创建/重命名/删除（删除经确认）。点击项目卡片进入看板。
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowUpRightIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/query-keys";
import type { Project } from "@/types/project";

export default function WorkspacePage() {
	const { workspaceId = "" } = useParams();
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);

	const {
		data: projects,
		isLoading,
		isError,
	} = useQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () => api<Project[]>(`/api/workspaces/${workspaceId}/projects`),
		enabled: workspaceId !== "",
	});

	const invalidateProjects = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });

	const createMutation = useMutation({
		mutationFn: (name: string) =>
			api<Project>(`/api/workspaces/${workspaceId}/projects`, {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const renameMutation = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Project>(`/api/projects/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/projects/${id}`, { method: "DELETE" }),
		onSuccess: invalidateProjects,
	});

	return (
		<div className="mx-auto max-w-4xl p-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-display text-2xl font-semibold tracking-wide">项目</h1>
				<Button onClick={() => setCreateOpen(true)}>
					<PlusIcon /> 新建项目
				</Button>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16">
					<Spinner />
				</div>
			) : isError ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载项目失败
				</p>
			) : projects && projects.length > 0 ? (
				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{projects.map((project) => (
						<li
							key={project.id}
							className="fuda group flex items-center justify-between p-4"
						>
							<Link
								to={`/w/${workspaceId}/p/${project.id}`}
								className="flex min-w-0 flex-1 items-center gap-2"
							>
								<div className="min-w-0">
									<p className="font-display truncate font-semibold tracking-wide">{project.name}</p>
									<p className="font-mono-num mt-0.5 font-mono text-xs text-muted-foreground">
										{project.createdAt.slice(0, 10)}
									</p>
								</div>
								<ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
							</Link>
							<div className="flex shrink-0 gap-1">
								<Button
									variant="ghost"
									size="icon"
									aria-label={`重命名 ${project.name}`}
									onClick={() => setRenaming(project)}
								>
									<PencilIcon />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label={`删除 ${project.name}`}
									className="text-destructive"
									onClick={() => setDeleting(project)}
								>
									<TrashIcon />
								</Button>
							</div>
						</li>
					))}
				</ul>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>还没有项目</EmptyTitle>
						<EmptyDescription>
							点击右上角"新建项目"，系统会自动创建默认列（待办/进行中/已完成）。
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			<NameDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="新建项目"
				description="创建后将自动带上默认列：待办 / 进行中 / 已完成。"
				submitLabel="创建"
				onSubmit={async (name) => {
					await createMutation.mutateAsync(name);
				}}
			/>
			<NameDialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
				title="重命名项目"
				description="修改项目名称。"
				submitLabel="保存"
				initialValue={renaming?.name ?? ""}
				onSubmit={async (name) => {
					if (renaming)
						await renameMutation.mutateAsync({ id: renaming.id, name });
				}}
			/>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="删除项目"
				description={`确定删除"${deleting?.name ?? ""}"吗？其下列与任务将一并删除，此操作不可撤销。`}
				onConfirm={async () => {
					if (deleting) await deleteMutation.mutateAsync(deleting.id);
				}}
			/>
		</div>
	);
}
