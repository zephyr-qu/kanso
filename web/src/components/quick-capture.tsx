// Quick Capture（快速捕获）：右下 FAB + Q 键打开，输标题 → 选项目 → 选优先级 → 一键建任务。
// 对齐原型 shell.jsx QuickCapture：任务落入目标项目首列（待办），创建后停留原页（toast 反馈，不跳转）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import DatePicker from "@/components/date-picker";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { normalizePriority, PRIORITIES, PRIORITY_LABEL } from "@/lib/priority";
import type { Board } from "@/types/board";
import type { Label } from "@/types/label";
import type { Project } from "@/types/project";
import type { Task } from "@/types/task";
import type { Workspace } from "@/types/workspace";

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
}: {
	open: boolean;
	onClose: () => void;
	/** 从当前看板带入默认项目。 */
	defaultProjectId?: string | null;
}) {
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("med");
	const [workspaceId, setWorkspaceId] = useState<string | "">("");
	const [projectId, setProjectId] = useState<string | "">("");
	const [dueDate, setDueDate] = useState("");
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();

	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<Workspace[]>(buildPath("workspaces")),
	});

	// 打开时重置；有默认项目则优先用它（并定位其工作区）。
	useEffect(() => {
		if (!open) return;
		setTitle("");
		setPriority("med");
		setWorkspaceId("");
		setProjectId("");
		setDueDate("");
		setLabelIds([]);
		const t = setTimeout(() => inputRef.current?.focus(), 30);
		return () => clearTimeout(t);
	}, [open]);

	// 项目列表（随工作区变化）。
	const { data: projects } = useQuery({
		queryKey: queryKeys.projects(workspaceId),
		queryFn: () =>
			api<Project[]>(buildPath("workspaceProjects", { workspaceId })),
		enabled: open && workspaceId !== "",
	});

	// 目标列：所选项目看板的首列（待办）。
	const { data: board } = useQuery({
		queryKey: queryKeys.board(projectId),
		queryFn: () => api<Board>(buildPath("project", { id: projectId })),
		enabled: open && projectId !== "",
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
			queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) });
			// 任务带截止日期，日历视图需同步失效（否则日历页停留时数据陈旧）。
			queryClient.invalidateQueries({ queryKey: queryKeys.calendar() });
			onClose();
		},
	});

	// 打开即自动级联选择：第一个工作区 → 第一个项目。
	const effectiveWs = workspaceId || workspaces?.[0]?.id || "";
	const effectiveProj =
		projectId || (projects?.length ? projects[0].id : "") || "";
	const wsChanged = effectiveWs !== workspaceId;
	const projChanged = effectiveProj !== projectId;

	useEffect(() => {
		if (open && effectiveWs && wsChanged && !defaultProjectId) setWorkspaceId(effectiveWs);
	}, [open, effectiveWs, wsChanged, defaultProjectId]);
	useEffect(() => {
		if (open && effectiveProj && projChanged && !defaultProjectId) setProjectId(effectiveProj);
	}, [open, effectiveProj, projChanged, defaultProjectId]);

	// defaultProjectId 优先：锁定该项目首列（默认项目属于非首个工作区时，
	// 级联仍会选中首个工作区——见下方看板回填，避免两个下拉错位，S-13）。
	useEffect(() => {
		if (!open || !defaultProjectId) return;
		setProjectId(defaultProjectId);
	}, [open, defaultProjectId]);
	// 项目所属工作区由看板数据回填：默认项目锁定后，工作区下拉跟随其真实归属。
	useEffect(() => {
		if (!open || !defaultProjectId || !board?.project) return;
		if (board.project.id === defaultProjectId) {
			setWorkspaceId(board.project.workspaceId);
		}
	}, [open, defaultProjectId, board]);

	const canCreate = title.trim().length > 0 && targetColumn !== undefined;

	function submit() {
		if (!canCreate) return;
		createTask.mutate(title.trim());
	}

	return (
		<Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogContent className="sm:max-w-[440px]">
					<div className="flex items-center justify-between border-b px-5 py-4">
						<div>
							<div className="text-[17px] font-semibold tracking-tight">快速捕获</div>
							<div className="mt-0.5 text-xs text-muted-foreground">
								Q 键任意页面一键创建任务，先记下来，稍后安排。
							</div>
						</div>
						<DialogClose />
					</div>

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

						{/* 项目选择：工作区 → 项目 */}
						{/* 项目选择：工作区 → 项目（必填，级联） */}
						<div className="space-y-1.5">
							<div className="grid grid-cols-[1fr_1.2fr] gap-2 px-0.5">
								<span className="text-[11px] font-medium text-muted-foreground">
									工作区<span className="ml-0.5 text-destructive">*</span>
								</span>
								<span className="text-[11px] font-medium text-muted-foreground">
									项目<span className="ml-0.5 text-destructive">*</span>
								</span>
							</div>
							<div className="grid grid-cols-[1fr_1.2fr] gap-2">
								<Select
									value={effectiveWs}
									onValueChange={(value) => {
										if (value) {
											setWorkspaceId(value);
											setProjectId("");
										}
									}}
								>
									<SelectTrigger
										className="kanso-quick-capture-select-trigger"
										aria-label="工作区"
									>
										<SelectValue>
											{workspaces?.find((w) => w.id === effectiveWs)?.name ?? "选择工作区"}
										</SelectValue>
									</SelectTrigger>
									<SelectPopup className="kanso-quick-capture-select-popup">
										{(workspaces ?? []).map((w) => (
											<SelectItem
												key={w.id}
												value={w.id}
												className="kanso-quick-capture-select-item"
											>
												{w.name}
											</SelectItem>
										))}
									</SelectPopup>
								</Select>
								<Select
									value={effectiveProj}
									onValueChange={(value) => value && setProjectId(value)}
								>
									<SelectTrigger
										className="kanso-quick-capture-select-trigger"
										aria-label="项目"
									>
										<SelectValue>
											{projects?.find((p) => p.id === effectiveProj)?.name ?? "选择项目"}
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

					{/* 优先级：左标签 + 右按钮组（与截止日期/标签行对齐） */}
					<div className="flex items-center justify-between gap-2">
						<span className="text-[11px] font-medium text-muted-foreground">优先级</span>
						<div className="flex flex-wrap justify-end gap-1.5">
							{PRIORITIES.map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => setPriority(p)}
									className={`kanso-priority-option kanso-priority-option--${p}`}
									data-selected={priority === p}
								>
									<span className="kanso-priority-option__dot" aria-hidden="true" />
									{PRIORITY_LABEL[normalizePriority(p)]}
								</button>
							))}
						</div>
					</div>

						{/* 截止日期（可选） */}
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

						{/* 标签（可选，多选） */}
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
				</DialogContent>
			</DialogPortal>
		</Dialog>
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
