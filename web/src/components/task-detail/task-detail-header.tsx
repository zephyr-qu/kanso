import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { Link } from "react-router";
import type { TaskDetail } from "@/types/task-detail";
import { Button } from "@/components/ui/button";

type TaskDetailHeaderProps = {
	workspaceId: string;
	projectId: string;
	data?: TaskDetail;
	onArchive: () => void;
	onDelete: () => void;
	onClose: () => void;
};

export function TaskDetailHeader({
	workspaceId,
	projectId,
	data,
	onArchive,
	onDelete,
	onClose,
}: TaskDetailHeaderProps) {
	return (
		<header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border pl-4 pr-2">
			<div className="kanso-task-detail__breadcrumb min-w-0">
				<Link
					to={`/w/${workspaceId}/p/${projectId}`}
					className="kanso-task-detail__breadcrumb-project kanso-task-detail__breadcrumb-link"
				>
					{data?.projectName || "看板"}
				</Link>
				<span className="kanso-task-detail__breadcrumb-separator">/</span>
				<h1 className="kanso-task-detail__breadcrumb-task">
					{data?.task.title || "任务详情"}
				</h1>
				{data?.task.archivedAt ? <span className="kanso-chip">已归档</span> : null}
			</div>
			<div className="kanso-task-detail__header-right shrink-0">
				{data ? (
					<>
						<div className="kanso-task-detail__header-actions">
							<Button
								variant="ghost"
								size="icon"
								className="kanso-icon-button"
								aria-label={data.task.archivedAt ? "恢复任务" : "归档任务"}
								onClick={onArchive}
							>
								{data.task.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
							</Button>
							{data.task.archivedAt ? (
								<Button
									variant="ghost"
									size="icon"
									className="kanso-icon-button"
									data-danger="true"
									aria-label="永久删除任务"
									onClick={onDelete}
								>
									<Trash2Icon />
								</Button>
							) : null}
						</div>
					</>
				) : null}
				<Button
					variant="ghost"
					size="icon"
					className="kanso-icon-button"
					aria-label="关闭任务详情"
					title="关闭"
					onClick={onClose}
				>
					<XIcon />
				</Button>
			</div>
		</header>
	);
}
