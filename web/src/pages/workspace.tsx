// 工作区页：项目卡片网格 + 创建/重命名/删除（删除经确认）。点击卡片进入看板。
// 借鉴原型 proj-card：白卡 + 圆角 + hover 上浮；操作按钮 hover 显示（数据无列/任务计数，故省略 counts pills）。
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClockIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
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
import { buildPath } from "@/lib/endpoints";
import { formatUpdated } from "@/lib/format-relative";
import { queryKeys } from "@/hooks/query-keys";
import type { Project } from "@/types/project";
import type { Workspace } from "@/types/workspace";
import { PageContent, PageHeader, PrimaryButton } from "@/components/kanso-ui";

export default function WorkspacePage() {
	const { workspaceId = "" } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);
	const [wsRenaming, setWsRenaming] = useState(false);
	const [wsDeleting, setWsDeleting] = useState(false);

	// 当前工作区名（来自工作区列表；重命名后同步）。
	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});
	const workspaceName =
		workspaces?.find((w) => w.id === workspaceId)?.name ?? "工作区";

	const invalidateWorkspaces = () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
	};
	const invalidateProjects = () =>
		queryClient.invalidateQueries({
			queryKey: queryKeys.projects(workspaceId),
		});

	const wsRenameMutation = useMutation({
		mutationFn: (name: string) =>
			api<Workspace>(buildPath("workspace", { id: workspaceId }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateWorkspaces,
	});
	const wsDeleteMutation = useMutation({
		mutationFn: () =>
			api<void>(buildPath("workspace", { id: workspaceId }), { method: "DELETE" }),
		onSuccess: () => {
			invalidateWorkspaces();
			navigate("/"); // RedirectHome 落到剩余工作区
		},
	});

	const {
		data: projects,
		isLoading,
		isError,
	} = useQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () => api<Project[]>(buildPath("workspaceProjects", { workspaceId })),
		enabled: workspaceId !== "",
	});

	const createMutation = useMutation({
		mutationFn: (name: string) =>
			api<Project>(buildPath("workspaceProjects", { workspaceId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const renameMutation = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Project>(buildPath("project", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(buildPath("project", { id }), { method: "DELETE" }),
		onSuccess: invalidateProjects,
	});

	return (
		<div className="kanso-workspace-page flex h-full flex-col">
			<PageHeader>
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-[17px] font-[650] tracking-tight">
						{workspaceName}
					</h1>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label="重命名工作区"
						onClick={() => setWsRenaming(true)}
					>
						<PencilIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-destructive"
						aria-label="删除工作区"
						onClick={() => setWsDeleting(true)}
					>
						<TrashIcon />
					</Button>
				</div>
				<div className="flex items-center gap-2">
					<PrimaryButton onClick={() => setCreateOpen(true)}>
						<PlusIcon /> 新建项目
					</PrimaryButton>
				</div>
			</PageHeader>

			<PageContent className="kanso-workspace-content px-[30px] pb-11 pt-[26px]">

			{isLoading ? (
				<div className="flex justify-center py-16">
					<Spinner />
				</div>
			) : isError ? (
				<p className="py-16 text-center text-sm text-destructive">
					加载项目失败
				</p>
			) : projects && projects.length > 0 ? (
				<div className="kanso-workspace-grid">
					{projects.map((project) => (
						<Link
							key={project.id}
							to={`/w/${workspaceId}/p/${project.id}`}
					// 对齐原型 .project-card（方向 F）：8px 圆角、1px 边框、内边距 18/18/14、子元素 gap 10px、hover 上浮 3px。
												className="kanso-project-card group"
						>
							<p className="kanso-project-card__title truncate pr-12">
								{project.name}
							</p>
							{/* 计数标签（对齐原型 proj-counts：gap 6px、chip 11px/500/1.5） */}
											<div className="kanso-project-card__counts">
												<span className="kanso-chip">
													{project.taskCount ?? 0} 任务
												</span>
												<span className="kanso-chip">
													{project.inProgressCount ?? 0} 进行中
								</span>
							</div>
							{/* 时间（对齐原型 proj-meta：12px、gap 6px；未更新过显示创建时间，更新过显示更新时间） */}
							<p className="kanso-project-card__meta">
														<ClockIcon className="size-3 shrink-0" />
								{project.updatedAt
									? formatUpdated(project.updatedAt)
									: `创建于 ${project.createdAt.slice(0, 10)}`}
							</p>

							{/* hover 操作：重命名 / 删除（阻止冒泡避免触发跳转） */}
							<div
							// 对齐原型 .proj-actions：右上角 12px、hover 显示。
							className="kanso-project-card__actions"
								onClick={(e) => e.preventDefault()}
								onPointerDown={(e) => e.stopPropagation()}
							>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									aria-label={`重命名 ${project.name}`}
									onClick={() => setRenaming(project)}
								>
									<PencilIcon />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 text-destructive"
									aria-label={`删除 ${project.name}`}
									onClick={() => setDeleting(project)}
								>
									<TrashIcon />
								</Button>
							</div>
						</Link>
					))}
					<button type="button" className="kanso-project-card kanso-new-project-card" onClick={() => setCreateOpen(true)}>
						<PlusIcon className="size-5" />
						<span>新建项目</span>
					</button>
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>还没有项目</EmptyTitle>
						<EmptyDescription>
							点击右上角"新建项目"，系统会自动创建默认列（待办/进行中/已阻塞/已完成）。
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
			</PageContent>

			<NameDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="新建项目"
				description="创建后将自动带上默认列：待办 / 进行中 / 已阻塞 / 已完成。"
				submitLabel="创建"
				onSubmit={async (name) => {
					await createMutation.mutateAsync(name);
				}}
			>
			</NameDialog>
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
			<NameDialog
				open={wsRenaming}
				onOpenChange={setWsRenaming}
				title="重命名工作区"
				description="修改工作区名称。"
				submitLabel="保存"
				initialValue={workspaceName}
				onSubmit={async (name) => {
					await wsRenameMutation.mutateAsync(name);
				}}
			/>
			<ConfirmDialog
				open={wsDeleting}
				onOpenChange={setWsDeleting}
				title="删除工作区"
				description={`确定删除"${workspaceName}"吗？其下所有项目、列与任务将一并删除，此操作不可撤销。`}
				onConfirm={async () => {
					await wsDeleteMutation.mutateAsync();
				}}
			/>
		</div>
	);
}
