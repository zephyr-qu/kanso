// M5-M4:里程碑进度分享卡弹窗——把进度渲染成品牌图卡,可下载 PNG。
// 分享聚焦「完成了什么进度」(里程碑名称/截止/进度条/百分比),不含任务明细。
import { useRef } from "react";
import { toPng } from "html-to-image";
import { FlagIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Milestone } from "@/types/board";

function pctOf(m: Milestone): number {
	return m.progress && m.progress.total > 0
		? Math.round((m.progress.done / m.progress.total) * 100)
		: 0;
}

export default function ShareMilestoneDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectName: string;
	milestones: Milestone[];
}) {
	const cardRef = useRef<HTMLDivElement | null>(null);
	const { projectName, milestones } = props;
	const generatedAt = new Date();

	// 下载 PNG:从卡片 DOM 节点导出。
	const download = async () => {
		if (!cardRef.current) return;
		const dataUrl = await toPng(cardRef.current, {
			backgroundColor: "#fff8f0",
			pixelRatio: 2,
		});
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `kanso-进度-${projectName}.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>进度分享卡</DialogTitle>
					</DialogHeader>
					<DialogPanel className="space-y-4">
						{/* 卡片本体:品牌头 + 项目 + 里程碑进度 + 生成时间 (无任务明细)。 */}
						<div
							ref={cardRef}
							className="w-[440px] rounded-lg bg-[#fff8f0] p-6"
							style={{ background: "#fff8f0" }}
						>
							<div className="mb-4 flex items-center gap-2">
								<span className="flex size-6 items-center justify-center rounded-md bg-[#c2410c] font-serif text-sm text-white">
									簡
								</span>
								<span className="text-base font-bold tracking-tight text-[#37352f]">
									Kanso · {projectName}
								</span>
							</div>

							{milestones.length === 0 ? (
								<p className="text-sm text-[#a29d95]">暂无里程碑</p>
							) : (
								<div className="space-y-3">
									{milestones.map((m) => (
										<div key={m.id}>
											<div className="flex items-baseline justify-between text-sm">
												<span className="font-medium text-[#37352f]">{m.name}</span>
												<span className="text-[#6f6b64]">{pctOf(m)}%</span>
											</div>
											<div className="mt-1 h-2 overflow-hidden rounded-full bg-[#e8e2d7]">
												<div
													className="h-full rounded-full bg-[#c2410c]"
													style={{ width: `${pctOf(m)}%` }}
												/>
											</div>
											<div className="mt-0.5 text-xs text-[#a29d95]">
												{m.dueDate ? `截止 ${m.dueDate}` : "未设截止"}
											</div>
										</div>
									))}
								</div>
							)}

							<div className="mt-5 flex items-center gap-2 text-xs text-[#a29d95]">
								<FlagIcon className="size-3.5" />
								生成于 {generatedAt.toLocaleString("zh-CN")}
							</div>
						</div>

						<div className="flex items-center justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => props.onOpenChange(false)}
							>
								关闭
							</Button>
							<Button size="sm" onClick={download}>
								<DownloadIcon className="size-4" /> 下载 PNG
							</Button>
						</div>
					</DialogPanel>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
