// 工作区页：项目列表 + 创建/重命名/删除（删除经确认）。
import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogPopup,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { Project } from "@/types/project";

// NameDialog 承担"创建项目"与"重命名项目"两种形态。
function NameDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	submitLabel: string;
	initialValue?: string;
	onSubmit: (name: string) => Promise<void>;
}) {
	const [name, setName] = useState(props.initialValue ?? "");
	const [submitting, setSubmitting] = useState(false);

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
						<DialogDescription>{props.description}</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4 p-4"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!name.trim() || submitting) return;
							setSubmitting(true);
							try {
								await props.onSubmit(name.trim());
								props.onOpenChange(false);
								setName("");
							} finally {
								setSubmitting(false);
							}
						}}
					>
						<div className="space-y-1.5">
							<Label htmlFor="project-name">名称</Label>
							<Input
								id="project-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
								placeholder="项目名称"
							/>
						</div>
						<DialogFooter>
							<DialogClose render={<Button variant="ghost">取消</Button>} />
							<Button
								type="submit"
								loading={submitting}
								disabled={!name.trim()}
							>
								{props.submitLabel}
							</Button>
						</DialogFooter>
					</form>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}

// ConfirmDialog 承担删除确认。
function ConfirmDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	onConfirm: () => Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
						<DialogDescription>{props.description}</DialogDescription>
					</DialogHeader>
					<DialogFooter className="p-4 pt-0">
						<DialogClose render={<Button variant="ghost">取消</Button>} />
						<Button
							variant="destructive"
							loading={submitting}
							onClick={async () => {
								setSubmitting(true);
								try {
									await props.onConfirm();
									props.onOpenChange(false);
								} finally {
									setSubmitting(false);
								}
							}}
						>
							删除
						</Button>
					</DialogFooter>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}

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
		queryKey: ["projects", workspaceId],
		queryFn: () => api<Project[]>(`/api/workspaces/${workspaceId}/projects`),
		enabled: workspaceId !== "",
	});

	const invalidateProjects = () =>
		queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });

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
				<h1 className="text-xl font-semibold">项目</h1>
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
							className="group flex items-center justify-between rounded-lg border bg-card p-4"
						>
							<div className="min-w-0">
								<p className="truncate font-medium">{project.name}</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{project.createdAt.slice(0, 10)}
								</p>
							</div>
							<div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
