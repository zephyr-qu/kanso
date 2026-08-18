// M5-M4:里程碑进度分享卡——可炫耀/发朋友圈的品牌图卡,可下载 PNG。
// 创意方向:暖色出版风 + 大圆环总进度(视觉中心) + 图标化里程碑列表 + 品牌底;
// 偏向竖向社交卡,弹窗内居中。内联样式供 toPng 稳定导出。
import { useRef } from "react";
import { toPng } from "html-to-image";
import { DownloadIcon, FlagIcon, CheckCircle2 } from "lucide-react";
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
const ORANGE2 = "#e0601f";
const INK = "#37352f";
const SOFT = "#6f6b64";
const FAINT = "#a29d95";
const PAPER = "#f6f1e9";
const LINE = "rgba(55,53,47,.09)";
const SERIF = "Noto Serif SC, Georgia, serif";
const MONO = "IBM Plex Mono, ui-monospace, monospace";

function pctOf(m: Milestone): number {
	return m.progress && m.progress.total > 0
		? Math.round((m.progress.done / m.progress.total) * 100)
		: 0;
}

// 环形进度 SVG:centre 放百分比,stroke 焦橙。
function Ring({ pct, size = 168 }: { pct: number; size?: number }) {
	const r = 74;
	const C = 2 * Math.PI * r;
	const done = (pct / 100) * C;
	const c = size / 2;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
			<circle cx={c} cy={c} r={r} fill="none" stroke={LINE} strokeWidth={13} />
			<circle
				cx={c}
				cy={c}
				r={r}
				fill="none"
				stroke={ORANGE}
				strokeWidth={13}
				strokeLinecap="round"
				strokeDasharray={`${done} ${C}`}
				transform={`rotate(-90 ${c} ${c})`}
			/>
			<text
				x={c}
				y={c + 6}
				textAnchor="middle"
				fontFamily={MONO}
				fontSize={46}
				fontWeight={700}
				fill={INK}
			>
				{pct}%
			</text>
			<text
				x={c}
				y={c + 30}
				textAnchor="middle"
				fontFamily={SERIF}
				fontSize={12}
				letterSpacing="0.2em"
				fill={FAINT}
			>
				完成
			</text>
		</svg>
	);
}

// 纯展示卡片 DOM;供 toPng 导出。竖向 480 宽,社交卡比例。
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
	const overall = total > 0 ? Math.round((done / total) * 100) : 0;

	return (
		<div
			style={{
				width: 480,
				background: PAPER,
				overflow: "hidden",
				borderRadius: 16,
				margin: "0 auto",
				boxShadow: "0 1px 0 rgba(55,53,47,.05)",
			}}
		>
			{/* 顶部装饰条 */}
			<div
				style={{
					height: 8,
					background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE2}, #f0a563)`,
				}}
			/>

			<div style={{ padding: "28px 34px 26px" }}>
				{/* 品牌行 */}
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
					<span style={{ fontSize: 10, letterSpacing: ".14em", color: FAINT }}>
						里程碑进度
					</span>
				</div>

				{/* 中部:项目名(衬线大标题)+ 环形总进度(视觉中心)*/}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						paddingTop: 30,
					}}
				>
					<h2
						style={{
							fontFamily: SERIF,
							fontSize: 34,
							lineHeight: 1.25,
							color: INK,
							margin: 0,
							maxWidth: 380,
							textAlign: "center",
							letterSpacing: "-0.01em",
						}}
					>
						{projectName}
					</h2>
					<p
						style={{
							fontSize: 10,
							color: FAINT,
							margin: "8px 0 0",
							letterSpacing: ".18em",
						}}
					>
						MILESTONE PROGRESS
					</p>

					<div style={{ margin: "26px 0 10px" }}>
						<Ring pct={overall} />
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span
							style={{
								fontFamily: MONO,
								fontSize: 24,
								fontWeight: 700,
								color: ORANGE,
							}}
						>
							{done}
						</span>
						<span style={{ fontSize: 13, color: SOFT }}>
							/ {total} 个里程碑任务完成
						</span>
					</div>
				</div>

				{/* 分隔 */}
				<div style={{ height: 1, background: LINE, margin: "26px 0 20px" }} />

				{/* 里程碑列表(图标 + 名称 + 等宽百分比)} */}
				{milestones.length === 0 ? (
					<div
						style={{
							textAlign: "center",
							fontSize: 13,
							color: FAINT,
							padding: "10px 0",
						}}
					>
						暂无里程碑
					</div>
				) : (
					milestones.map((m) => {
						const pct = pctOf(m);
						return (
							<div key={m.id} style={{ marginBottom: 16 }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
									}}
								>
									<div
										style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}
									>
										{pct >= 100 ? (
											<CheckCircle2 size={16} color={ORANGE} />
										) : (
											<FlagIcon size={16} color={SOFT} />
										)}
										<span style={{ fontSize: 15, color: INK, fontWeight: 600 }}>
											{m.name}
										</span>
									</div>
									<span
										style={{
											fontFamily: MONO,
											fontSize: 18,
											fontWeight: 700,
											color: pct >= 100 ? ORANGE : INK,
										}}
									>
										{pct}%
									</span>
								</div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										marginTop: 6,
										gap: 14,
										paddingLeft: 25,
									}}
								>
									<div
										style={{ flex: 1, height: 4, borderRadius: 99, background: LINE }}
									>
										<div
											style={{
												height: "100%",
												width: `${pct}%`,
												borderRadius: 99,
												background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE2})`,
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

				{/* 底部:生成时间 + 品牌 */}
				<div
					style={{
						marginTop: 6,
						paddingTop: 16,
						borderTop: `1px solid ${LINE}`,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span style={{ fontSize: 10, letterSpacing: ".1em", color: FAINT }}>
						生成于 {generatedAt.getFullYear()}-
						{String(generatedAt.getMonth() + 1).padStart(2, "0")}-
						{String(generatedAt.getDate()).padStart(2, "0")}
					</span>
					<div style={{ display: "flex", alignItems: "center", gap: 7 }}>
						<span style={{ fontSize: 10, color: FAINT }}>by</span>
						<span
							style={{
								fontSize: 11,
								letterSpacing: ".16em",
								color: SOFT,
								fontWeight: 600,
							}}
						>
							KANSO
						</span>
					</div>
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
