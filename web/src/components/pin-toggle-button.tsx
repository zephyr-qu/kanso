// 置顶切换按钮（项目卡 / 看板标题共用）：图钉切换置顶，跨组件同步置顶列表。
import { PinIcon, PinOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePinnedProjects } from "@/lib/pinned-projects";
import { cn } from "@/lib/cn";

export function PinToggleButton({
	projectId,
	name,
	className,
}: {
	projectId: string;
	name: string;
	className?: string;
}) {
	const { isPinned, toggle } = usePinnedProjects();
	const pinned = isPinned(projectId);
	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				"size-6",
				pinned ? "text-primary" : "text-muted-foreground hover:text-foreground",
				className,
			)}
			aria-label={pinned ? `取消置顶 ${name}` : `置顶 ${name}`}
			title={pinned ? "取消置顶" : "置顶"}
			onClick={() => toggle(projectId)}
		>
			{pinned ? (
				<PinOffIcon className="size-3.5" />
			) : (
				<PinIcon className="size-3.5" />
			)}
		</Button>
	);
}
