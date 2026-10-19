// 工作区页：项目卡片网格 + 创建/重命名/归档/删除（删除经确认）。点击卡片进入看板。
// 借鉴原型 proj-card：白卡 + 圆角 + hover 上浮；操作按钮 hover 显示。
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArchiveIcon,
	ClockIcon,
	PencilIcon,
	PlusIcon,
	RotateCcwIcon,
	Share2Icon,
	TrashIcon,
	XIcon,
} from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { PinToggleButton } from "@/components/pin-toggle-button";
import ShareMilestoneDialog from "@/components/share-milestone-dialog";
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
import {
	invalidateWorkspaceProjects,
	invalidateWorkspaces,
	queryKeys,
} from "@/hooks/query-keys";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import { preloadRoute } from "@/lib/route-preload";
import { prefetchBoard } from "@/lib/query-prefetch";
import type { Project } from "@/types/project";
import type { Milestone } from "@/types/board";
import type { Workspace } from "@/types/workspace";
import { PageContent, PageHeader, PrimaryButton, QuietButton } from "@/components/kanso-ui";

export default function WorkspacePage() {
	const { workspaceId = "" } = useParams();
	const { currentWorkspace: workspace } = useWorkspaceContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [renaming, setRenaming] = useState<Project | null>(null);
	const [deleting, setDeleting] = useState<Project | null>(null);
	const [archiving, setArchiving] = useState<Project | null>(null);
	const [restoring, setRestoring] = useState<Project | null>(null);
	const [shareProject, setShareProject] = useState<Project | null>(null);
	const [wsRenaming, setWsRenaming] = useState(false);
	const [wsDeleting, setWsDeleting] = useState(false);
	const [archivedOpen, setArchivedOpen] = useState(false);

	const workspaceName = workspace?.name ?? "工作区";

	useEffect(() => {
		if (!archivedOpen) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setArchivedOpen(false);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [archivedOpen]);

	const refreshWorkspaces = () => {
		invalidateWorkspaces(queryClient);
	};
	const invalidateProjects = () =>
		invalidateWorkspaceProjects(queryClient, workspaceId);

	const wsRenameMutation = useMutation({
		meta: {
			feedback: { success: "工作区已更新", errorTitle: "重命名工作区失败" },
		},
		mutationFn: (name: string) =>
			api<Workspace>(buildPath("workspace", { id: workspaceId }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: refreshWorkspaces,
	});
	const wsDeleteMutation = useMutation({
		meta: { feedback: { success: "工作区已删除", errorTitle: "删除工作区失败" } },
		mutationFn: () =>
			api<void>(buildPath("workspace", { id: workspaceId }), { method: "DELETE" }),
		onSuccess: () => {
			refreshWorkspaces();
			navigate("/app");
		},
	});

	const {
		data: projects,
		isLoading,
		isError,
	} = useQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () =>
			api<Project[]>(buildPath("workspaceProjects", { workspaceId })),
		enabled: workspaceId !== "",
	});

	const archivedQuery = useQuery({
		queryKey: queryKeys.archivedProjects(workspaceId),
		queryFn: () =>
			api<Project[]>(buildPath("workspaceArchivedProjects", { workspaceId })),
		enabled: workspaceId !== "" && archivedOpen,
	});

	const shareMilestones = useQuery({
		queryKey: queryKeys.milestones(shareProject?.id ?? ""),
		queryFn: () =>
			api<Milestone[]>(buildPath("projectMilestones", { id: shareProject!.id })),
		enabled: shareProject !== null,
	});
	const createMutation = useMutation({
		meta: { feedback: { success: "项目已创建", errorTitle: "创建项目失败" } },
		mutationFn: (name: string) =>
			api<Project>(buildPath("workspaceProjects", { workspaceId }), {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const renameMutation = useMutation({
		meta: { feedback: { success: "项目已更新", errorTitle: "重命名项目失败" } },
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api<Project>(buildPath("project", { id }), {
				method: "PATCH",
				body: JSON.stringify({ name }),
			}),
		onSuccess: invalidateProjects,
	});

	const deleteMutation = useMutation({
		meta: { feedback: { success: "项目已删除", errorTitle: "删除项目失败" } },
		mutationFn: (id: string) =>
			api<void>(buildPath("project", { id }), { method: "DELETE" }),
		onSuccess: invalidateProjects,
	});

	const archiveMutation = useMutation({
		meta: { feedback: { success: "项目已归档", errorTitle: "归档项目失败" } },
		mutationFn: (id: string) =>
			api<Project>(buildPath("projectArchive", { id }), { method: "POST" }),
		onSuccess: invalidateProjects,
	});

	const restoreMutation = useMutation({
		meta: { feedback: { success: "项目已恢复", errorTitle: "恢复项目失败" } },
		mutationFn: (id: string) =>
			api<Project>(buildPath("projectRestore", { id }), { method: "POST" }),
		onSuccess: invalidateProjects,
	});

	return (
		<div className="kanso-workspace-page flex h-full flex-col">
			<PageHeader>
				<div className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-[1.0625rem] font-[650] tracking-tight">
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
					<QuietButton onClick={() => setArchivedOpen(true)}>
						<ArchiveIcon /> 已归档
					</QuietButton>
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
					<p className="py-16 text-center text-sm text-destructive">加载项目失败</p>
				) : projects && projects.length > 0 ? (
					<div className="kanso-workspace-grid">
						{projects.map((project) => (
							<ProjectCard
								key={project.id}
								project={project}
								workspaceId={workspaceId}
								queryClient={queryClient}
								onRename={setRenaming}
								onArchive={setArchiving}
								onDelete={setDeleting}
								onShare={setShareProject}
							/>
						))}
						<button
							type="button"
							className="kanso-project-card kanso-new-project-card"
							onClick={() => setCreateOpen(true)}
						>
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

			{archivedOpen ? (
				<div
					className="fixed inset-0 z-50"
					role="dialog"
					aria-modal="true"
					aria-label="已归档项目"
				>
					<div
						className="absolute inset-0 bg-black/30 animate-fade-in motion-reduce:animate-none"
						onClick={() => setArchivedOpen(false)}
					/>
					<div className="absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col bg-background shadow-2xl animate-drawer-in motion-reduce:animate-none">
						<header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border pl-4 pr-2">
							<h2 className="text-sm font-[650]">已归档项目</h2>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								aria-label="关闭"
								onClick={() => setArchivedOpen(false)}
							>
								<XIcon />
							</Button>
						</header>
						<div className="flex-1 overflow-auto p-3">
							{archivedQuery.isLoading ? (
								<div className="flex justify-center py-12">
									<Spinner />
								</div>
							) : archivedQuery.isError ? (
								<p className="py-12 text-center text-sm text-destructive">
									加载归档项目失败
								</p>
							) : (archivedQuery.data?.length ?? 0) === 0 ? (
								<p className="py-12 text-center text-sm text-muted-foreground">
									暂无归档项目
								</p>
							) : (
								<ul className="space-y-2">
									{archivedQuery.data!.map((project) => (
										<li key={project.id}>
											<div className="group flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:bg-card/90">
												<Link
													to={`/w/${workspaceId}/p/${project.id}`}
													className="min-w-0 flex-1"
													onMouseEnter={() => {
														preloadRoute("board");
														prefetchBoard(queryClient, project.id);
													}}
													onClick={() => setArchivedOpen(false)}
												>
													<p className="truncate text-sm font-medium">{project.name}</p>
													<p className="mt-1 flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
														<ClockIcon className="size-3 shrink-0" />
														{project.archivedAt
															? formatUpdated(
																	project.archivedAt,
																	Date.now(),
																	"归档于",
																)
															: "已归档"}
														<span>·</span>
														<span>{project.taskCount ?? 0} 任务</span>
													</p>
												</Link>
												<div className="flex shrink-0 items-center gap-0.5">
													<Button
														variant="ghost"
														size="icon"
														className="size-7"
														aria-label={`恢复 ${project.name}`}
														onClick={() => setRestoring(project)}
													>
														<RotateCcwIcon />
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
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			) : null}

			<NameDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				title="新建项目"
				description="创建后将自动带上默认列：待办 / 进行中 / 已阻塞 / 已完成。"
				submitLabel="创建"
				onSubmit={async (name) => {
					await createMutation.mutateAsync(name);
				}}
			></NameDialog>

			<ShareMilestoneDialog
				open={shareProject !== null}
				onOpenChange={(o) => {
					if (!o) setShareProject(null);
				}}
				projectName={shareProject?.name ?? ""}
				milestones={shareMilestones.data ?? []}
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
					if (renaming) await renameMutation.mutateAsync({ id: renaming.id, name });
				}}
			/>
			<ConfirmDialog
				open={archiving !== null}
				onOpenChange={(open) => {
					if (!open) setArchiving(null);
				}}
				title="归档项目"
				description={`确定归档「${archiving?.name ?? ""}」吗？需先完成或归档所有未完成任务；归档后项目只读，可随时恢复。`}
				confirmLabel="归档"
				destructive={false}
				onConfirm={async () => {
					if (archiving) await archiveMutation.mutateAsync(archiving.id);
				}}
			/>
			<ConfirmDialog
				open={restoring !== null}
				onOpenChange={(open) => {
					if (!open) setRestoring(null);
				}}
				title="恢复项目"
				description={`确定恢复「${restoring?.name ?? ""}」吗？恢复后将回到工作区项目列表，可继续编辑。`}
				confirmLabel="恢复"
				destructive={false}
				onConfirm={async () => {
					if (restoring) await restoreMutation.mutateAsync(restoring.id);
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

function ProjectCard(props: {
	project: Project;
	workspaceId: string;
	queryClient: ReturnType<typeof useQueryClient>;
	onRename: (project: Project) => void;
	onArchive: (project: Project) => void;
	onDelete: (project: Project) => void;
	onShare: (project: Project) => void;
}) {
	const { project, workspaceId, queryClient, onRename, onArchive, onDelete, onShare } =
		props;
	return (
		<Link
			to={`/w/${workspaceId}/p/${project.id}`}
			onMouseEnter={() => {
				preloadRoute("board");
				prefetchBoard(queryClient, project.id);
			}}
			onFocus={() => {
				preloadRoute("board");
				prefetchBoard(queryClient, project.id);
			}}
			className="kanso-project-card group"
		>
			<p className="kanso-project-card__title truncate pr-12">{project.name}</p>
			<div className="kanso-project-card__counts">
				<span className="kanso-chip">{project.taskCount ?? 0} 任务</span>
				<span className="kanso-chip">
					{project.inProgressCount ?? 0} 进行中
				</span>
			</div>
			<p className="kanso-project-card__meta pr-12">
				<ClockIcon className="size-3 shrink-0" />
				{project.updatedAt
					? formatUpdated(project.updatedAt)
					: `创建于 ${project.createdAt.slice(0, 10)}`}
			</p>

			<div
				className="kanso-project-card__actions"
				onClick={(e) => e.preventDefault()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<PinToggleButton
					workspaceId={workspaceId}
					projectId={project.id}
					name={project.name}
					className="size-7"
				/>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label={`重命名 ${project.name}`}
					onClick={() => onRename(project)}
				>
					<PencilIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label={`归档 ${project.name}`}
					onClick={() => onArchive(project)}
				>
					<ArchiveIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-destructive"
					aria-label={`删除 ${project.name}`}
					onClick={() => onDelete(project)}
				>
					<TrashIcon />
				</Button>
			</div>

			<div
				className="kanso-project-card__share"
				onClick={(e) => e.preventDefault()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label={`分享 ${project.name}`}
					onClick={() => onShare(project)}
				>
					<Share2Icon />
				</Button>
			</div>
		</Link>
	);
}
