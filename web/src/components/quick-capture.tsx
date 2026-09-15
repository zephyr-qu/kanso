// Quick Capture（快速捕获）：右下 FAB + Q 键打开。
// 快速模式：标题 → 项目 → 优先级 → 建任务（落入首列）。
// AI 模式：粘贴文本 → 后端分析候选 → 预览编辑 → 批量创建。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogContent,
	DialogPortal,
} from "@/components/ui/dialog";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateTaskScope, queryKeys } from "@/hooks/query-keys";
import DatePicker from "@/components/date-picker";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { normalizePriority, PRIORITIES, PRIORITY_LABEL } from "@/lib/priority";
import type { Board } from "@/types/board";
import type { Label } from "@/types/label";
import type { Project } from "@/types/project";
import type { Task } from "@/types/task";

type CaptureMode = "quick" | "ai";

type AICaptureTask = {
	title: string;
	priority?: string;
	dueDate?: string | null;
	projectId: string;
	columnId: string;
	labelIds?: string[];
	milestoneIds?: string[];
};

type AIDraftRow = {
	key: string;
	title: string;
	priority: string;
	dueDate: string;
	projectId: string;
	columnId: string;
	labelIds: string[];
	milestoneIds: string[];
};

/** 右下角悬浮按钮（AppShell 挂载），title 提示 Q 快捷键。 */
export function QuickCaptureFab({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			title="快速捕获（Q）"
			aria-label="快速捕获（Q）"
			onClick={onClick}
			className="kanso-quick-capture fixed bottom-7 right-7 z-[90] flex size-[50px] items-center justify-center transition-transform duration-150 hover:-translate-y-0.5 hover:scale-[1.04]"
		>
			<PlusIcon className="size-5" />
		</button>
	);
}

export function QuickCapture({
	open,
	onClose,
	defaultProjectId,
	workspaceId: currentWorkspaceId,
	workspaceName,
}: {
	open: boolean;
	onClose: () => void;
	/** 从当前看板带入默认项目。 */
	defaultProjectId?: string | null;
	workspaceId: string;
	workspaceName?: string;
}) {
	const [mode, setMode] = useState<CaptureMode>("quick");
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("med");
	const workspaceId = currentWorkspaceId;
	const [projectId, setProjectId] = useState<string | "">("");
	const [dueDate, setDueDate] = useState("");
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [aiText, setAiText] = useState("");
	const [aiDrafts, setAiDrafts] = useState<AIDraftRow[]>([]);
	const [creatingBatch, setCreatingBatch] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const aiTextRef = useRef<HTMLTextAreaElement>(null);
	const draftKeyPrefix = useId();
	const queryClient = useQueryClient();

	// 打开时重置；有默认项目则优先用它。
	useEffect(() => {
		if (!open) return;
		setMode("quick");
		setTitle("");
		setPriority("med");
		setProjectId("");
		setDueDate("");
		setLabelIds([]);
		setAiText("");
		setAiDrafts([]);
		setCreatingBatch(false);
		const t = setTimeout(() => inputRef.current?.focus(), 30);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		if (!open || mode !== "ai" || aiDrafts.length > 0) return;
		const t = setTimeout(() => aiTextRef.current?.focus(), 30);
		return () => clearTimeout(t);
	}, [open, mode, aiDrafts.length]);

	const { data: projects } = useQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () =>
			api<Project[]>(buildPath("workspaceProjects", { workspaceId })),
		enabled: open && workspaceId !== "",
	});

	const { data: board } = useQuery({
		queryKey: queryKeys.board(projectId),
		queryFn: () => api<Board>(buildPath("project", { id: projectId })),
		enabled: open && mode === "quick" && projectId !== "",
	});
	const targetColumn = board?.columns[0];

	const createTask = useMutation({
		meta: { feedback: { success: "任务已创建", errorTitle: "创建任务失败" } },
		mutationFn: (capturedTitle: string) =>
			api<Task>(buildPath("columnTasks", { columnId: targetColumn!.id }), {
				method: "POST",
				body: JSON.stringify({
					title: capturedTitle,
					priority,
					dueDate: dueDate || null,
					labels: labelIds,
				}),
			}),
		onSuccess: (task) => {
			invalidateTaskScope(queryClient, {
				projectId,
				workspaceId,
				taskId: task.id,
			});
			onClose();
		},
	});

	const analyzeAI = useMutation({
		meta: { feedback: { errorTitle: "AI 分析失败" } },
		mutationFn: () =>
			api<{ tasks: AICaptureTask[] }>(
				buildPath("aiCaptureAnalyze", { id: workspaceId }),
				{
					method: "POST",
					body: JSON.stringify({
						text: aiText,
						defaultProjectId: defaultProjectId || projectId || undefined,
					}),
				},
			),
		onSuccess: (res) => {
			const rows: AIDraftRow[] = (res.tasks ?? []).map((task, index) => ({
				key: `${draftKeyPrefix}-${index}-${task.title}`,
				title: task.title,
				priority: normalizePriority(task.priority ?? "med"),
				dueDate: task.dueDate ?? "",
				projectId: task.projectId,
				columnId: task.columnId,
				labelIds: task.labelIds ?? [],
				milestoneIds: task.milestoneIds ?? [],
			}));
			setAiDrafts(rows);
			if (rows.length === 0) {
				toastManager.add({
					title: "未解析出任务",
					description: "请调整粘贴内容后重试。",
					type: "info",
				});
			}
		},
	});

	useEffect(() => {
		if (!open || !defaultProjectId) return;
		setProjectId(defaultProjectId);
	}, [open, defaultProjectId]);

	const canCreate = title.trim().length > 0 && targetColumn !== undefined;

	function submit() {
		if (!canCreate) return;
		createTask.mutate(title.trim());
	}

	async function createAIBatch() {
		const rows = aiDrafts.filter((row) => row.title.trim() && row.columnId);
		if (rows.length === 0) return;
		setCreatingBatch(true);
		let ok = 0;
		const failures: string[] = [];
		try {
			for (const row of rows) {
				try {
					const task = await api<Task>(
						buildPath("columnTasks", { columnId: row.columnId }),
						{
							method: "POST",
							body: JSON.stringify({
								title: row.title.trim(),
								priority: row.priority,
								dueDate: row.dueDate || null,
								labels: row.labelIds,
							}),
						},
					);
					for (const mid of row.milestoneIds) {
						try {
							await api(
								buildPath("taskMilestones", {
									taskId: task.id,
									milestoneId: mid,
								}),
								{ method: "POST" },
							);
						} catch {
							// 里程碑不存在或无权时跳过
						}
					}
					invalidateTaskScope(queryClient, {
						projectId: row.projectId,
						workspaceId,
						taskId: task.id,
					});
					ok += 1;
				} catch (err) {
					failures.push(
						`${row.title.trim()}: ${err instanceof Error ? err.message : "失败"}`,
					);
				}
			}
			if (ok > 0 && failures.length === 0) {
				toastManager.add({
					title: `已创建 ${ok} 项任务`,
					type: "success",
				});
				onClose();
			} else if (ok > 0) {
				toastManager.add({
					title: `已创建 ${ok} 项，${failures.length} 项失败`,
					description: failures.slice(0, 3).join("；"),
					type: "warning",
				});
				onClose();
			} else {
				toastManager.add({
					title: "批量创建失败",
					description: failures.slice(0, 3).join("；"),
					type: "error",
				});
			}
		} finally {
			setCreatingBatch(false);
		}
	}

	const dialogWide = mode === "ai" && aiDrafts.length > 0;

	return (
		<Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogContent
					className={dialogWide ? "sm:max-w-[560px]" : "sm:max-w-[440px]"}
				>
					<div className="flex items-center justify-between border-b px-5 py-4">
						<div>
							<div className="text-[17px] font-semibold tracking-tight">
								快速捕获
							</div>
							<div className="mt-0.5 text-xs text-muted-foreground">
								{mode === "quick"
									? "Q 键任意页面一键创建任务，先记下来，稍后安排。"
									: "粘贴一段文字，AI 拆成多条候选任务，确认后再创建。"}
							</div>
						</div>
						<DialogClose />
					</div>

					<div className="flex gap-1 border-b px-5 pt-2">
						{(
							[
								["quick", "快速"],
								["ai", "AI"],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								onClick={() => setMode(value)}
								className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
									mode === value
										? "border-primary font-medium text-foreground"
										: "border-transparent text-muted-foreground hover:text-foreground"
								}`}
							>
								{label}
							</button>
						))}
					</div>

					{mode === "quick" ? (
						<>
							<div className="space-y-3 px-5 py-4">
								<input
									ref={inputRef}
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && canCreate) submit();
									}}
									placeholder="任务标题…"
									className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
								/>

								<div className="space-y-1.5">
									<span className="text-[11px] font-medium text-muted-foreground">
										当前工作区
									</span>
									<div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
										{workspaceName || "未选择工作区"}
									</div>
									<div className="space-y-1.5">
										<span className="text-[11px] font-medium text-muted-foreground">
											项目
											<span className="ml-0.5 text-destructive">*</span>
										</span>
										<Select
											value={projectId}
											onValueChange={(value) => value && setProjectId(value)}
										>
											<SelectTrigger
												className="kanso-quick-capture-select-trigger"
												aria-label="项目"
											>
												<SelectValue>
													{projects?.find((p) => p.id === projectId)?.name ??
														"选择项目"}
												</SelectValue>
											</SelectTrigger>
											<SelectPopup className="kanso-quick-capture-select-popup">
												{(projects ?? []).map((p) => (
													<SelectItem
														key={p.id}
														value={p.id}
														className="kanso-quick-capture-select-item"
													>
														{p.name}
													</SelectItem>
												))}
											</SelectPopup>
										</Select>
									</div>
								</div>

								<div className="flex items-center justify-between gap-2">
									<span className="text-[11px] font-medium text-muted-foreground">
										优先级
									</span>
									<div className="flex flex-wrap justify-end gap-1.5">
										{PRIORITIES.map((p) => (
											<button
												key={p}
												type="button"
												onClick={() => setPriority(p)}
												className={`kanso-priority-option kanso-priority-option--${p}`}
												data-selected={priority === p}
											>
												<span
													className="kanso-priority-option__dot"
													aria-hidden="true"
												/>
												{PRIORITY_LABEL[normalizePriority(p)]}
											</button>
										))}
									</div>
								</div>

								<div className="flex items-center justify-between gap-2">
									<span className="text-[11px] font-medium text-muted-foreground">
										截止日期
									</span>
									<DatePicker
										value={dueDate}
										onChange={setDueDate}
										ariaLabel="截止日期"
										placeholder="设置日期"
									/>
								</div>

								<div className="flex items-center justify-between gap-2">
									<span className="text-[11px] font-medium text-muted-foreground">
										标签
									</span>
									<QuickCaptureLabelPicker
										labels={board?.labels ?? []}
										selected={labelIds}
										onToggle={(id) =>
											setLabelIds((current) =>
												current.includes(id)
													? current.filter((x) => x !== id)
													: [...current, id],
											)
										}
									/>
								</div>
							</div>

							<div className="flex justify-end gap-2 border-t px-5 py-3.5">
								<Button variant="ghost" size="sm" onClick={onClose}>
									取消
								</Button>
								<Button
									size="sm"
									disabled={!canCreate}
									loading={createTask.isPending}
									onClick={submit}
								>
									创建任务
								</Button>
							</div>
						</>
					) : (
						<>
							<div className="space-y-3 px-5 py-4">
								{aiDrafts.length === 0 ? (
									<>
										<textarea
											ref={aiTextRef}
											value={aiText}
											onChange={(e) => setAiText(e.target.value)}
											placeholder="粘贴会议纪要、待办清单或一段说明…"
											rows={8}
											className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
										/>
										<p className="text-[11px] text-muted-foreground">
											分析使用服务端配置的 OpenAI 兼容接口；密钥不会下发到浏览器。
										</p>
									</>
								) : (
									<div className="max-h-[min(60vh,480px)] space-y-3 overflow-y-auto pr-0.5">
										{aiDrafts.map((draft) => (
											<AIDraftEditor
												key={draft.key}
												draft={draft}
												projects={projects ?? []}
												onChange={(next) =>
													setAiDrafts((rows) =>
														rows.map((row) =>
															row.key === draft.key ? next : row,
														),
													)
												}
												onRemove={() =>
													setAiDrafts((rows) =>
														rows.filter((row) => row.key !== draft.key),
													)
												}
											/>
										))}
									</div>
								)}
							</div>

							<div className="flex justify-end gap-2 border-t px-5 py-3.5">
								<Button variant="ghost" size="sm" onClick={onClose}>
									取消
								</Button>
								{aiDrafts.length === 0 ? (
									<Button
										size="sm"
										disabled={aiText.trim().length === 0}
										loading={analyzeAI.isPending}
										onClick={() => analyzeAI.mutate()}
									>
										分析
									</Button>
								) : (
									<>
										<Button
											variant="outline"
											size="sm"
											disabled={creatingBatch}
											onClick={() => setAiDrafts([])}
										>
											重新粘贴
										</Button>
										<Button
											size="sm"
											disabled={
												creatingBatch ||
												aiDrafts.every(
													(row) => !row.title.trim() || !row.columnId,
												)
											}
											loading={creatingBatch}
											onClick={() => void createAIBatch()}
										>
											创建 {aiDrafts.filter((r) => r.title.trim()).length} 项
										</Button>
									</>
								)}
							</div>
						</>
					)}
				</DialogContent>
			</DialogPortal>
		</Dialog>
	);
}

function AIDraftEditor({
	draft,
	projects,
	onChange,
	onRemove,
}: {
	draft: AIDraftRow;
	projects: Project[];
	onChange: (next: AIDraftRow) => void;
	onRemove: () => void;
}) {
	const { data: board } = useQuery({
		queryKey: queryKeys.board(draft.projectId),
		queryFn: () => api<Board>(buildPath("project", { id: draft.projectId })),
		enabled: draft.projectId !== "",
	});

	useEffect(() => {
		if (!board?.columns.length) return;
		const colOk = board.columns.some((c) => c.id === draft.columnId);
		if (colOk) return;
		const labels = draft.labelIds.filter((id) =>
			board.labels.some((label) => label.id === id),
		);
		onChange({
			...draft,
			columnId: board.columns[0].id,
			labelIds: labels,
		});
		// 仅在列失效时纠正；避免把 onChange/draft 整对象放进依赖导致循环。
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
	}, [board, draft.columnId, draft.projectId]);

	return (
		<div className="space-y-2 rounded-lg border bg-muted/20 p-3">
			<div className="flex items-start gap-2">
				<input
					value={draft.title}
					onChange={(e) => onChange({ ...draft, title: e.target.value })}
					aria-label="任务标题"
					className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
				/>
				<Button
					variant="ghost"
					size="sm"
					aria-label="删除候选"
					onClick={onRemove}
					className="shrink-0 px-2"
				>
					<Trash2Icon className="size-3.5" />
				</Button>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div className="space-y-1">
					<span className="text-[11px] text-muted-foreground">项目</span>
					<Select
						value={draft.projectId}
						onValueChange={(value) => {
							if (!value) return;
							onChange({
								...draft,
								projectId: value,
								columnId: "",
								labelIds: [],
								milestoneIds: [],
							});
						}}
					>
						<SelectTrigger
							className="kanso-quick-capture-select-trigger h-8"
							aria-label="项目"
						>
							<SelectValue>
								{projects.find((p) => p.id === draft.projectId)?.name ??
									"选择项目"}
							</SelectValue>
						</SelectTrigger>
						<SelectPopup className="kanso-quick-capture-select-popup">
							{projects.map((p) => (
								<SelectItem
									key={p.id}
									value={p.id}
									className="kanso-quick-capture-select-item"
								>
									{p.name}
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				</div>
				<div className="space-y-1">
					<span className="text-[11px] text-muted-foreground">列</span>
					<Select
						value={draft.columnId}
						onValueChange={(value) =>
							value && onChange({ ...draft, columnId: value })
						}
					>
						<SelectTrigger
							className="kanso-quick-capture-select-trigger h-8"
							aria-label="列"
						>
							<SelectValue>
								{board?.columns.find((c) => c.id === draft.columnId)?.name ??
									"选择列"}
							</SelectValue>
						</SelectTrigger>
						<SelectPopup className="kanso-quick-capture-select-popup">
							{(board?.columns ?? []).map((c) => (
								<SelectItem
									key={c.id}
									value={c.id}
									className="kanso-quick-capture-select-item"
								>
									{c.name}
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap gap-1">
					{PRIORITIES.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => onChange({ ...draft, priority: p })}
							className={`kanso-priority-option kanso-priority-option--${p}`}
							data-selected={draft.priority === p}
						>
							<span className="kanso-priority-option__dot" aria-hidden="true" />
							{PRIORITY_LABEL[normalizePriority(p)]}
						</button>
					))}
				</div>
				<DatePicker
					value={draft.dueDate}
					onChange={(value) => onChange({ ...draft, dueDate: value })}
					ariaLabel="截止日期"
					placeholder="日期"
				/>
			</div>

			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] text-muted-foreground">标签</span>
				<QuickCaptureLabelPicker
					labels={board?.labels ?? []}
					selected={draft.labelIds}
					onToggle={(id) =>
						onChange({
							...draft,
							labelIds: draft.labelIds.includes(id)
								? draft.labelIds.filter((x) => x !== id)
								: [...draft.labelIds, id],
						})
					}
				/>
			</div>
		</div>
	);
}

/** 标签多选：Popover 勾选列表（与任务卡标签弹层同款交互）。 */
function QuickCaptureLabelPicker(props: {
	labels: Label[];
	selected: string[];
	onToggle: (id: string) => void;
}) {
	const { labels, selected, onToggle } = props;
	const selectedNames = labels
		.filter((label) => selected.includes(label.id))
		.map((label) => label.name);
	const display =
		selectedNames.length > 0 ? selectedNames.join("、") : "选择标签";
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" aria-label="标签">
						<span className="max-w-[180px] truncate">{display}</span>
						<ChevronDownIcon className="size-3 opacity-70" />
					</Button>
				}
			/>
			<PopoverPopup className="w-52 p-2" align="end">
				{labels.length === 0 ? (
					<p className="px-1 py-2 text-xs text-muted-foreground">
						暂无标签，可先在看板创建
					</p>
				) : (
					<ul className="space-y-0.5">
						{labels.map((label) => {
							const attached = selected.includes(label.id);
							return (
								<li key={label.id}>
									<button
										type="button"
										className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
										onClick={() => onToggle(label.id)}
									>
										<span className="flex-1">{label.name}</span>
										{attached ? <span className="text-primary">✓</span> : null}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</PopoverPopup>
		</Popover>
	);
}
