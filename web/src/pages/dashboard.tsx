// 仪表盘页（全局汇总）：统计卡 / 完成进度 / 需要关注 / 列分布 / 任务趋势 / 项目速览 / 最近活动。
// 数据来自 /api/dashboard（跨全部工作区聚合；状态口径按列位置，不依赖列名）。
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import ActivityItem from "@/components/activity-item";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/query-keys";
import { getRecentProjectsAll } from "@/lib/recent-projects";
import type { DashboardData } from "@/lib/dashboard";
import { formatDateTime } from "@/lib/format-relative";


export default function DashboardPage() {
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.dashboard(),
		queryFn: () => api<DashboardData>("/api/dashboard"),
	});

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	if (isError || !data) {
		return (
			<p className="py-16 text-center text-sm text-destructive">
				加载仪表盘失败
			</p>
		);
	}

	// 项目速览：全部工作区最近打开的 5 个（打开记录在进入看板时写入 localStorage）。
	// 一次求值，map 内复用（此前 map 内二次调用 getRecentProjectsAll）。
	const recentProjectEntries = getRecentProjectsAll(5);
	const recentProjects = recentProjectEntries
		.map((r) => data.projects.find((p) => p.id === r.projectId))
		.filter((p) => p !== undefined);

	const maxColumn = Math.max(1, ...data.byColumn.map((c) => c.count));

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
				<h1 className="text-[17px] font-[650] tracking-tight">仪表盘</h1>
				<span className="text-[13px] text-muted-foreground">
					全部工作区 · 汇总
				</span>
			</div>

			<div className="flex-1 overflow-auto px-8 pb-12 pt-7">
				{/* 统计卡 */}
				<div className="grid grid-cols-4 gap-3.5">
					<StatCard
						num={data.totalTasks}
						label="全部任务"
						trend={`完成 ${data.completionPercent}%`}
						bar={data.completionPercent}
					/>
					<StatCard
						num={data.newThisWeek}
						label="本周新增"
						trend="过去 7 天"
						accent
					/>
					<StatCard num={data.urgent} label="紧急" trend="需要关注" warn />
					<StatCard
						num={data.projects.length}
						label="项目"
						trend="全部工作区"
					/>
				</div>

				{/* 面板网格 */}
				<div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3.5">
					{/* 完成进度 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle>完成进度</PanelTitle>
						<div className="flex items-center gap-5">
							<div
								className="relative size-[120px] shrink-0 rounded-full"
								style={{
									background: `conic-gradient(var(--chart-1) ${data.completionPercent * 3.6}deg, color-mix(in srgb, var(--foreground) 6%, transparent) 0)`,
								}}
							>
								<div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
									<span className="text-[26px] font-bold tracking-tight tabular-nums">
										{data.completionPercent}%
									</span>
									<span className="text-[11px] text-muted-foreground">
										{data.doneTasks} / {data.totalTasks}
									</span>
								</div>
							</div>
							<div>
								<div className="text-sm font-medium">
									{data.doneTasks} 个任务已完成
								</div>
								<div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
									共 {data.totalTasks} 个任务 · 剩余{" "}
									{data.totalTasks - data.doneTasks} 个
								</div>
								<div className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
									已完成 = 位于看板末列的任务
								</div>
							</div>
						</div>
					</div>

					{/* 需要关注 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle>需要关注</PanelTitle>
						{data.focus.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								暂无紧急任务
							</p>
						) : (
							<div className="flex flex-col">
								{data.focus.map((f) => (
									<div
										key={f.id}
										className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
									>
										<span className="size-2 shrink-0 rounded-full bg-destructive" />
										<span className="min-w-0 flex-1 truncate text-sm">
											{f.title}
										</span>
										<span className="shrink-0 text-xs text-muted-foreground">
											{f.column}
										</span>
									</div>
								))}
							</div>
						)}
					</div>

					{/* 列分布 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle>任务分布</PanelTitle>
						{data.byColumn.map((c) => (
							<div
								key={c.name}
								className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
							>
								<span className="w-14 shrink-0 text-[13px] text-muted-foreground">
									{c.name}
								</span>
								<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary"
										style={{ width: `${(c.count / maxColumn) * 100}%` }}
									/>
								</div>
								<span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
									{c.count}
								</span>
							</div>
						))}
					</div>

					{/* 任务趋势 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle
							action={
								<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
									<span className="flex items-center gap-1">
										<span className="size-2 rounded-full bg-[var(--chart-1)]" />
										新增
									</span>
									<span className="flex items-center gap-1">
										<span className="size-2 rounded-full bg-[var(--chart-5)]" />
										完成
									</span>
								</div>
							}
						>
							任务趋势
						</PanelTitle>
						<TrendChart points={data.trend} />
					</div>

					{/* 项目速览 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle>项目速览</PanelTitle>
						{recentProjects.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								打开过项目后会显示在这里
							</p>
						) : (
							recentProjects.map((p) => {
								const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
								const entry = recentProjectEntries.find(
									(r) => r.projectId === p.id,
								);
								const wsId = entry?.workspaceId ?? "";
								return (
									<Link
										key={p.id}
										to={wsId ? `/w/${wsId}/p/${p.id}` : "#"}
										className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
									>
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{p.name}
										</span>
										<div className="h-1.5 w-[90px] shrink-0 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full rounded-full bg-primary"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<span className="w-[52px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
											{p.done}/{p.total}
										</span>
									</Link>
								);
							})
						)}
					</div>

					{/* 最近活动 */}
					<div className="rounded-xl border bg-card p-5">
						<PanelTitle>最近活动</PanelTitle>
						{data.recentActivity.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								暂无活动
							</p>
						) : (
							<div className="grid grid-cols-2 gap-x-8 gap-y-1">
								{data.recentActivity.map((a) => (
									<div
										key={a.id}
										className="flex items-baseline gap-2.5 py-1.5"
									>
										<span className="size-[7px] shrink-0 rounded-full bg-border" />
										<ActivityItem
											projectName={a.projectName}
											action={a.action}
										/>
										<span className="shrink-0 text-xs text-muted-foreground/70">
											{formatDateTime(a.createdAt)}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// TrendChart 近 14 天新增/完成双线折线图（手写 SVG，零依赖；与完成进度环形图同风格）。
function TrendChart({ points }: { points: DashboardData["trend"] }) {
	const W = 520;
	const H = 140;
	const PAD = 10;
	if (points.length < 2) {
		return (
			<p className="py-10 text-center text-xs text-muted-foreground">
				暂无趋势数据
			</p>
		);
	}
	const max = Math.max(
		1,
		...points.map((p) => Math.max(p.created, p.completed)),
	);
	const stepX = (W - PAD * 2) / (points.length - 1);
	const x = (i: number) => PAD + i * stepX;
	const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2 - 10);

	const line = (key: "created" | "completed") =>
		points
			.map(
				(p, i) =>
					`${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`,
			)
			.join(" ");
	const area = (key: "created" | "completed") =>
		`${line(key)} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-36 w-full text-foreground"
			role="img"
			aria-label="近 14 天任务趋势"
		>
			<defs>
				<linearGradient id="trend-created" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.16" />
					<stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
				</linearGradient>
				<linearGradient id="trend-completed" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="var(--chart-5)" stopOpacity="0.14" />
					<stop offset="100%" stopColor="var(--chart-5)" stopOpacity="0" />
				</linearGradient>
			</defs>
			{[0.25, 0.5, 0.75].map((t) => (
				<line
					key={t}
					x1={PAD}
					x2={W - PAD}
					y1={H * t}
					y2={H * t}
					stroke="currentColor"
					strokeOpacity="0.06"
					strokeDasharray="3 3"
				/>
			))}
			<path d={area("created")} fill="url(#trend-created)" />
			<path d={area("completed")} fill="url(#trend-completed)" />
			<path
				d={line("created")}
				fill="none"
				stroke="var(--chart-1)"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d={line("completed")}
				fill="none"
				stroke="var(--chart-5)"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<text x={PAD} y={H - 2} fontSize="10" fill="currentColor" opacity="0.55">
				{points[0].day.slice(5)}
			</text>
			<text
				x={W - PAD}
				y={H - 2}
				fontSize="10"
				fill="currentColor"
				opacity="0.55"
				textAnchor="end"
			>
				{points[points.length - 1].day.slice(5)}
			</text>
		</svg>
	);
}

function PanelTitle({
	children,
	action,
}: {
	children: React.ReactNode;
	/** 右侧操作区（如"全部项目 →"链接），与标题左对齐、操作右对齐。 */
	action?: React.ReactNode;
}) {
	return (
		<div className="mb-4 flex items-center justify-between">
			<span className="text-[13px] font-semibold text-foreground">
				{children}
			</span>
			{action}
		</div>
	);
}

function StatCard(props: {
	num: number;
	label: string;
	trend: string;
	bar?: number;
	accent?: boolean;
	warn?: boolean;
}) {
	const { num, label, trend, bar, accent, warn } = props;
	return (
		<div className="rounded-xl border border-transparent bg-card p-[18px_20px] shadow-lifted transition-all duration-150 hover:-translate-y-px hover:border-foreground/15 hover:shadow-card-hover">
			<div
				className={`text-[28px] font-bold tracking-tight tabular-nums ${
					accent ? "text-primary" : warn ? "text-destructive" : ""
				}`}
			>
				{num}
			</div>
			<div className="mt-0.5 text-[13px] font-medium text-foreground">
				{label}
			</div>
			<div className="mt-0.5 text-[11px] text-muted-foreground">{trend}</div>
			{bar !== undefined ? (
				<div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-primary"
						style={{ width: `${bar}%` }}
					/>
				</div>
			) : null}
		</div>
	);
}
