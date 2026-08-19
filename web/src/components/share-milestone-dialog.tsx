// M5-M4:里程碑进度分享卡——"旅程脚步曲线"版本。
// 主体:一条竖向蜿蜒曲线(像 GPS 足迹/roadmap),里程碑作为路上的节点;
// 完成的节点焦橙实心,未完成描边;节点旁标名称/截止。整体竖向往社交卡。
import { useLayoutEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { DownloadIcon, CheckIcon } from "lucide-react";
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

const ORANGE = "#c2410c";
const INK = "#37352f";
const SOFT = "#6f6b64";
const FAINT = "#a29d95";
const PAPER = "#f6f1e9";
const LINE = "rgba(55,53,47,.14)";
const SERIF = "Noto Serif SC, Georgia, serif";
const MONO = "IBM Plex Mono, ui-monospace, monospace";

import { progressPct } from "@/lib/milestone-progress";
// 竖向 S 形蜿蜒路径(三段贝塞尔),宽 400。
function pathD(H: number): string {
	return [
		`M 200 10`,
		`C 290 50, 110 120, 200 160`,
		`C 290 200, 110 250, 200 290`,
		`C 290 330, 110 380, 200 ${H - 10}`,
	].join(" ");
}

const NODE_STEP = 92; // 每节点纵向间距

// 旅程曲线 + 里程碑节点(HTML 标签定位在 SVG 节点坐标上)。
function Journey({ milestones }: { milestones: Milestone[] }) {
	const pathRef = useRef<SVGPathElement | null>(null);
	const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
	const [totalLen, setTotalLen] = useState(0);
	const n = Math.max(milestones.length, 1);
	const H = n * NODE_STEP + 36;
	const doneCount = milestones.filter((m) => progressPct(m) >= 100).length;
	const donePct = n > 0 ? doneCount / n : 0;

	useLayoutEffect(() => {
		const p = pathRef.current;
		if (!p) return;
		const len = p.getTotalLength();
		const arr = Array.from({ length: n }, (_, i) => {
			const pt = p.getPointAtLength(((i + 0.5) / n) * len);
			return { x: pt.x, y: pt.y };
		});
		setPts(arr);
		setTotalLen(len);
	}, [milestones.length, H]);

	return (
		<div
			style={{ position: "relative", width: 400, height: H, margin: "0 auto" }}
		>
			{/* 曲线 */}
			<svg width={400} height={H} style={{ position: "absolute", inset: 0 }}>
				<path
					ref={pathRef}
					d={pathD(H)}
					fill="none"
					stroke={LINE}
					strokeWidth={3}
					strokeLinecap="round"
					strokeDasharray="1 9"
					/>
					{/* 已完成部分的橙色描线 */}
					<path
						d={pathD(H)}
						fill="none"
						stroke={ORANGE}
						strokeWidth={3}
						strokeLinecap="round"
						strokeDasharray={`${totalLen * donePct} ${totalLen}`}
					/>
			</svg>

			{/* 里程碑节点 + 标签 */}
			{milestones.map((m, i) => {
				const pt = pts[i];
				if (!pt) return null;
				const done = progressPct(m) >= 100;
				const left = pt.x < 200;
				return (
					<div
						key={m.id}
						style={{
							position: "absolute",
							left: left ? pt.x + 26 : undefined,
							right: left ? undefined : 400 - pt.x + 26,
							top: pt.y - 18,
							maxWidth: 168,
							textAlign: left ? "left" : "right",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 7,
								justifyContent: left ? "flex-start" : "flex-end",
							}}
						>
							{done ? (
								<span
									style={{
										width: 20,
										height: 20,
										borderRadius: 10,
										background: ORANGE,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flex: "0 0 auto",
									}}
								>
									<CheckIcon size={12} color="#fff" strokeWidth={3.5} />
								</span>
							) : (
								<span
									style={{
										width: 20,
										height: 20,
										borderRadius: 10,
										border: `1.5px solid ${ORANGE}66`,
										background: PAPER,
										flex: "0 0 auto",
									}}
								/>
							)}
							<span
								style={{
									fontFamily: SERIF,
									fontSize: 15,
									fontWeight: 600,
									color: INK,
									whiteSpace: "nowrap",
								}}
							>
								{m.name}
							</span>
						</div>
						<div
							style={{
								fontSize: 10,
								color: FAINT,
								marginTop: 3,
								letterSpacing: ".05em",
							}}
						>
							{progressPct(m)}% {m.dueDate ? `· ${m.dueDate}` : ""}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// 纯展示卡片 DOM;供 toPng 导出。竖向 480 宽。
function CardVisual({
	projectName,
	milestones,
	generatedAt,
}: {
	projectName: string;
	milestones: Milestone[];
	generatedAt: Date;
}) {
	const total = milestones.reduce((nn, m) => nn + (m.progress?.total ?? 0), 0);
	const done = milestones.reduce((nn, m) => nn + (m.progress?.done ?? 0), 0);

	return (
		<div
			style={{
				width: "100%",
				maxWidth: 480,
				background: PAPER,
				overflow: "hidden",
				borderRadius: 16,
				margin: "0 auto",
				boxShadow: "0 1px 0 rgba(55,53,47,.05)",
			}}
		>
			<div style={{ padding: "28px 26px 0" }}>
				{/* 品牌行：左 logo+字标，右生成日期 */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 9 }}>
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
							<span style={{ color: "#fff8f0", fontFamily: SERIF, fontSize: 14 }}>
								簡
							</span>
						</div>
						<span
							style={{
								fontSize: 13,
								letterSpacing: ".18em",
								color: SOFT,
								fontWeight: 600,
							}}
						>
							KANSO
						</span>
					</div>
					<span style={{ fontFamily: MONO, fontSize: 10, color: FAINT }}>
						{generatedAt.getFullYear()}·
						{String(generatedAt.getMonth() + 1).padStart(2, "0")}·
						{String(generatedAt.getDate()).padStart(2, "0")}
					</span>
				</div>

				{/* 项目名 + 副标（两侧细线饰线） */}
				<h2
					style={{
						fontFamily: SERIF,
						fontSize: 34,
						lineHeight: 1.2,
						color: INK,
						margin: "28px 0 0",
						textAlign: "center",
						letterSpacing: "-0.01em",
					}}
				>
					{projectName}
				</h2>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 14,
						marginTop: 12,
					}}
				>
					<span style={{ width: 36, height: 1, background: LINE }} />
					<span style={{ fontSize: 10, letterSpacing: ".22em", color: FAINT }}>
						MILESTONE JOURNEY
					</span>
					<span style={{ width: 36, height: 1, background: LINE }} />
				</div>

				{/* 旅程曲线 */}
				<div style={{ marginTop: 30 }}>
					{milestones.length === 0 ? (
						<p
							style={{
								textAlign: "center",
								fontSize: 13,
								color: FAINT,
								padding: "30px 0",
							}}
						>
							暂无里程碑
						</p>
					) : (
						<Journey milestones={milestones} />
					)}
				</div>
			</div>

			{/* 底部：完成数 + 进度条 */}
			<div
				style={{
					marginTop: 28,
					borderTop: `1px solid ${LINE}`,
					padding: "16px 26px 20px",
				}}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span style={{ fontSize: 11, color: SOFT }}>
						{total > 0 ? (
							<><span style={{ fontFamily: MONO, fontWeight: 700, color: ORANGE }}>{done}</span>/{total} 完成</>
						) : (
							<span style={{ fontFamily: MONO, fontWeight: 700, color: ORANGE }}>未启动</span>
						)}
					</span>
					<span
						style={{
							fontSize: 11,
							letterSpacing: ".16em",
							fontWeight: 600,
							color: SOFT,
						}}
					>
						KANSO
					</span>
				</div>
				<div
					style={{
						marginTop: 12,
						height: 4,
						borderRadius: 99,
						background: "rgba(55,53,47,.08)",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							height: "100%",
							width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`,
							borderRadius: 99,
							background: ORANGE,
						}}
					/>
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
					<DialogPanel className="flex flex-col items-center gap-4 py-4">
						<div ref={cardRef} className="w-full">
							<CardVisual
								projectName={projectName}
								milestones={milestones}
								generatedAt={generatedAt}
							/>
						</div>
						<div className="flex items-center justify-end gap-2 self-end pr-1">
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
