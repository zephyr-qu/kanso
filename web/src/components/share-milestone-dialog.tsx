// M5-M4:里程碑进度分享卡弹窗——把进度渲染成品牌图卡,可下载 PNG。
// 设计语言:暖色出版风(暖白底 + 焦橙 + 衬线标题 + 等宽数据),聚焦"完成了什么进度"。
import { useRef } from "react";
import { toPng } from "html-to-image";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBackdrop, DialogHeader, DialogPanel, DialogPopup, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { Milestone } from "@/types/board";

const ORANGE = "#c2410c";
const INK = "#37352f";
const SOFT = "#6f6b64";
const FAINT = "#a29d95";
const PAPER = "#f6f1e9";
const SERIF = "Noto Serif SC, Georgia, serif";
const MONO = "IBM Plex Mono, ui-monospace, monospace";

function pctOf(m: Milestone): number {
	return m.progress && m.progress.total > 0
		? Math.round((m.progress.done / m.progress.total) * 100)
		: 0;
}

// 纯展示的卡片 DOM;被 ref 挂载,供 toPng 导出。固定 480 宽。
function CardVisual({
	projectName,
	milestones,
	generatedAt,
}: {
	projectName: string;
	milestones: Milestone[];
	generatedAt: Date;
}) {
	const done = milestones.reduce((n, m) => n + (m.progress?.done ?? 0), 0);
	const total = milestones.reduce((n, m) => n + (m.progress?.total ?? 0), 0);

	return (
		<div
			style={{
				width: 480,
				background: PAPER,
				overflow: "hidden",
				borderRadius: 12,
				boxShadow: "0 1px 0 rgba(55,53,47,.06)",
			}}
		>
			{/* 顶部品牌条 */}
			<div style={{ height: 6, background: `linear-gradient(90deg, ${ORANGE}, #e0601f)` }} />
			<div style={{ padding: "30px 32px 26px" }}>
				{/* 品牌行 */}
				<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
					<div
						style={{
							width: 26,
							height: 26,
							borderRadius: 7,
							background: ORANGE,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<span style={{ color: "#fff8f0", fontFamily: SERIF, fontSize: 14 }}>簡</span>
					</div>
					<span style={{ fontSize: 12, letterSpacing: ".22em", color: SOFT, fontWeight: 600 }}>
						KANSO · 里程碑进度
					</span>
				</div>

				{/* 项目名(衬线大标题) */}
				<h2
					style={{
						fontFamily: SERIF,
						fontSize: 30,
						lineHeight: 1.2,
						color: INK,
						margin: 0,
						letterSpacing: "-0.01em",
					}}
				>
					{projectName}
				</h2>
				<p style={{ fontSize: 10, color: FAINT, marginTop: 8, letterSpacing: ".12em" }}>
					MILESTONE PROGRESS
				</p>

				<div style={{ height: 1, background: "rgba(55,53,47,.09)", margin: "26px 0 22px" }} />

				{/* 里程碑列表 */}
				{milestones.length === 0 ? (
					<p style={{ fontSize: 13, color: FAINT }}>暂无里程碑</p>
				) : (
					milestones.map((m) => {
						const pct = pctOf(m);
						return (
							<div key={m.id} style={{ marginBottom: 18 }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
									<span style={{ fontSize: 14, color: INK, fontWeight: 600 }}>{m.name}</span>
									<span style={{ fontFamily: MONO, fontSize: 14, color: ORANGE, fontWeight: 700 }}>
										{pct}%
									</span>
								</div>
								<div style={{ display: "flex", alignItems: "center", marginTop: 7, gap: 14 }}>
									<div style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(55,53,47,.09)" }}>
										<div
											style={{
												height: "100%",
												width: `${pct}%`,
												borderRadius: 99,
												background: `linear-gradient(90deg, ${ORANGE}, #e0601f)`,
											}}
										/>
									</div>
									<span style={{ fontSize: 10, color: FAINT, whiteSpace: "nowrap" }}>
										{m.dueDate ? `截止 ${m.dueDate}` : "未设截止"}
									</span>
								</div>
							</div>
						);
					})
				)}

				{/* 底部:生成时间 + 完成度 */}
				<div
					style={{
						marginTop: 8,
						paddingTop: 16,
						borderTop: "1px solid rgba(55,53,47,.08)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span style={{ fontSize: 10, letterSpacing: ".1em", color: FAINT }}>
						生成于 {generatedAt.getFullYear()}-{String(generatedAt.getMonth() + 1).padStart(2, "0")}-
						{String(generatedAt.getDate()).padStart(2, "0")}
					</span>
					<span style={{ fontFamily: MONO, fontSize: 11, color: SOFT }}>
						{done}/{total} 完成
					</span>
				</div>
			</div>
		</div>
	);
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

	const download = async () => {
		if (!cardRef.current) return;
		const dataUrl = await toPng(cardRef.current, {
			backgroundColor: PAPER,
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
						<div ref={cardRef}>
							<CardVisual projectName={projectName} milestones={milestones} generatedAt={generatedAt} />
						</div>

						<div className="flex items-center justify-end gap-2">
							<Button variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}>
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
