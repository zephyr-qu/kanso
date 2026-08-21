import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, MilestoneIcon, PlusIcon, TagIcon } from "lucide-react";
import { Link } from "react-router";
import { PinToggleButton } from "@/components/pin-toggle-button";
import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SORT_FIELDS } from "@/hooks/use-board-sort";
import type { SortConfig, SortField } from "@/lib/sort-tasks";
import type { Board } from "@/types/board";
import { PageHeader, PrimaryButton, QuietButton } from "@/components/kanso-ui";

type BoardToolbarProps = {
	board: Board | undefined;
	workspaceName: string;
	projectId: string;
	sortConfig: SortConfig;
	setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
	viewMode: "columns" | "swimlane";
	setViewMode: React.Dispatch<React.SetStateAction<"columns" | "swimlane">>;
	setCreateOpen: (open: boolean) => void;
	setLabelManagerOpen: (open: boolean) => void;
	setArchiveOpen: (open: boolean) => void;
	setMilestoneOpen: (open: boolean) => void;
};

export function BoardToolbar({
	board,
	workspaceName,
	projectId,
	sortConfig,
	setSortConfig,
	viewMode,
	setViewMode,
	setCreateOpen,
	setLabelManagerOpen,
	setArchiveOpen,
	setMilestoneOpen,
}: BoardToolbarProps) {
	const sortLabels: Record<SortField, string> = {
		position: "原顺序",
		title: "标题",
		createdAt: "创建时间",
		priority: "优先级",
	};
	return (
		<PageHeader>
			<div className="flex min-w-0 items-baseline gap-3">
				<Link to={`/w/${board?.project.workspaceId ?? ""}`} className="kanso-board-breadcrumb__workspace">
					{workspaceName}
				</Link>
				<span className="kanso-board-breadcrumb__separator">/</span>
				<h1 className="truncate text-[17px] font-[650] tracking-tight">{board?.project.name ?? "看板"}</h1>
				{board && <PinToggleButton projectId={projectId} name={board.project.name} />}
			</div>
			<div className="kanso-board-toolbar flex gap-2">
				<Select
					value={sortConfig.field}
					onValueChange={(value) => {
						if (SORT_FIELDS.includes(value as SortField)) {
							setSortConfig((current) => ({ ...current, field: value as SortField }));
						}
					}}
				>
					<SelectTrigger className="kanso-board-sort-trigger" aria-label="任务排序">
						<SelectValue>{sortLabels[sortConfig.field]}</SelectValue>
					</SelectTrigger>
					<SelectPopup className="kanso-board-sort-popup">
						{SORT_FIELDS.map((field) => <SelectItem key={field} value={field} className="kanso-board-sort-item">{sortLabels[field]}</SelectItem>)}
					</SelectPopup>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					className="kanso-board-sort-direction"
					aria-label={sortConfig.direction === "asc" ? "切换为降序" : "切换为升序"}
					onClick={() => setSortConfig((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))}
				>
					{sortConfig.direction === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
				</Button>
				<QuietButton size="icon" aria-label="标签" onClick={() => setLabelManagerOpen(true)}><TagIcon /></QuietButton>
				<QuietButton size="icon" aria-label="归档" onClick={() => setArchiveOpen(true)}><ArchiveIcon /></QuietButton>
				<QuietButton size="icon" aria-label="里程碑" onClick={() => setMilestoneOpen(true)}><MilestoneIcon /></QuietButton>
				<div className="kanso-view-toggle" role="group" aria-label="看板视图">
					<button type="button" aria-pressed={viewMode === "columns"} onClick={() => setViewMode("columns")}>列</button>
					<button type="button" aria-pressed={viewMode === "swimlane"} onClick={() => setViewMode("swimlane")}>泳</button>
				</div>
				<PrimaryButton onClick={() => setCreateOpen(true)}><PlusIcon /> 新建列</PrimaryButton>
			</div>
		</PageHeader>
	);
}
