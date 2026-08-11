// 标签管理页（借鉴原型 #labels）：创建区（色板 + 名称）+ 标签库列表（hover 操作）。
// 数据来自标签 API（mock 聚合 taskCount；对接后端后由真实端点提供）。
import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/query-keys";
import type { LabelSummary } from "@/types/label";

// 原型色板（6 色）。
const PALETTE = [
	"#3b82f6",
	"#8b5cf6",
	"#f43f5e",
	"#10b981",
	"#f59e0b",
	"#0ea5e9",
];

export default function LabelsPage() {
	const { workspaceId = "" } = useParams();
	const queryClient = useQueryClient();

	const [name, setName] = useState("");
	const [color, setColor] = useState(PALETTE[0]);
	const [renaming, setRenaming] = useState<LabelSummary | null>(null);
	const [deleting, setDeleting] = useState<LabelSummary | null>(null);

	const { data: labels, isLoading } = useQuery({
		queryKey: queryKeys.labels(workspaceId),
		queryFn: () =>
			api<LabelSummary[]>(`/api/workspaces/${workspaceId}/labels`),
		enabled: workspaceId !== "",
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: queryKeys.labels(workspaceId),
		});

	const createMutation = useMutation({
		mutationFn: () =>
			api<LabelSummary>(`/api/workspaces/${workspaceId}/labels`, {
				method: "POST",
				body: JSON.stringify({ name: name.trim(), color }),
			}),
		onSuccess: () => {
			setName("");
			invalidate();
		},
	});

	const renameMutation = useMutation({
		mutationFn: ({ id, name: n }: { id: string; name: string }) =>
			api<LabelSummary>(`/api/labels/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ name: n }),
			}),
		onSuccess: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			api<void>(`/api/labels/${id}`, { method: "DELETE" }),
		onSuccess: invalidate,
	});

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
				<h1 className="text-[17px] font-[650] tracking-tight">标签</h1>
			</div>

			<div className="flex-1 overflow-auto px-8 pb-12 pt-7">
				{/* 创建标签 */}
				<div className="rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
					<div className="mb-4 text-[13px] font-semibold text-foreground">
						创建标签
					</div>
					<form
						className="flex items-center gap-2.5"
						onSubmit={(e) => {
							e.preventDefault();
							if (name.trim()) createMutation.mutate();
						}}
					>
						<div className="flex gap-1.5">
							{PALETTE.map((c) => (
								<button
									key={c}
									type="button"
									aria-label={`颜色 ${c}`}
									className={`size-[22px] rounded-full border-2 transition-transform hover:scale-110 ${
										color === c ? "border-foreground" : "border-transparent"
									}`}
									style={{ backgroundColor: c }}
									onClick={() => setColor(c)}
								/>
							))}
						</div>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="标签名称"
							className="h-9 flex-1"
						/>
						<Button
							type="submit"
							disabled={!name.trim() || createMutation.isPending}
						>
							<PlusIcon /> 添加
						</Button>
					</form>
				</div>

				{/* 标签库 */}
				<div className="mt-3.5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
					<div className="mb-1 flex items-center justify-between">
						<span className="text-[13px] font-semibold text-foreground">
							标签库
						</span>
						<span className="text-xs text-muted-foreground/70">
							{labels?.length ?? 0} 个
						</span>
					</div>

					{isLoading ? (
						<div className="flex justify-center py-10">
							<Spinner />
						</div>
					) : labels && labels.length > 0 ? (
						<div className="flex flex-col">
							{labels.map((label) => (
								<div
									key={label.id}
									className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-[rgba(24,24,27,0.04)]"
								>
									<span
										className="size-3 shrink-0 rounded-full"
										style={{ backgroundColor: label.color }}
									/>
									<span className="min-w-0 flex-1 truncate text-sm">
										{label.name}
									</span>
									<span className="shrink-0 text-xs text-muted-foreground/70">
										{label.taskCount} 个任务
									</span>
									<div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
										<Button
											variant="ghost"
											size="icon"
											className="size-6"
											aria-label={`重命名 ${label.name}`}
											onClick={() => setRenaming(label)}
										>
											<PencilIcon />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-6 text-destructive hover:bg-[rgba(24,24,27,0.06)]"
											aria-label={`删除 ${label.name}`}
											onClick={() => setDeleting(label)}
										>
											<TrashIcon />
										</Button>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="py-8 text-center text-xs text-muted-foreground">
							还没有标签，先在上方创建一个
						</p>
					)}
				</div>
			</div>

			<NameDialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
				title="重命名标签"
				description="修改标签名称，已贴标签的任务会同步更新。"
				submitLabel="保存"
				initialValue={renaming?.name ?? ""}
				onSubmit={async (n) => {
					if (renaming)
						await renameMutation.mutateAsync({ id: renaming.id, name: n });
				}}
			/>
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="删除标签"
				description={`确定删除标签"${deleting?.name ?? ""}"吗？已贴该标签的任务将不再显示它。`}
				onConfirm={async () => {
					if (deleting) await deleteMutation.mutateAsync(deleting.id);
				}}
			/>
		</div>
	);
}
