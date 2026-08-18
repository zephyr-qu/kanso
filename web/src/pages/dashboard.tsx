// 仪表盘页（全局汇总）：统计卡 / 完成进度 / 需要关注 / 列分布 / 任务趋势 / 项目速览 / 最近活动。
// 数据来自 /api/dashboard（跨全部工作区聚合；完成口径按列位置=末列；任务分布仅「按状态 / 按优先级」两种模板）。
import { useLayoutEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { CalendarDaysIcon, CheckIcon, LayoutTemplateIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverClose,
	PopoverPopup,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import ActivityItem from "@/components/activity-item";
import { activityIconForAction } from "@/components/activity-icon";
import { PRIORITIES, PRIORITY_LABEL, normalizePriority } from "@/lib/priority";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { getRecentProjectsAll } from "@/lib/recent-projects";
import type { DashboardData } from "@/lib/dashboard";
import type { TaskDetail } from "@/types/task-detail";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import { formatActivityAge } from "@/lib/format-relative";

// 任务分布面板的两种模板：按状态（列）/ 按优先级（任务字段）。
const DIST_TEMPLATES = [
	{ id: "status", label: "按状态" },
	{ id: "priority", label: "按优先级" },
] as const;
type DistTemplateId = (typeof DIST_TEMPLATES)[number]["id"];

export default function DashboardPage() {
	// 全局实时订阅：任何变更（含备份导入）失效聚合查询。
	useRealtime(undefined);
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.dashboard(),
		queryFn: () => api<DashboardData>(buildPath("dashboard")),
	});
	const focusProjectQueries = useQueries({
		queries: (data?.focus ?? []).map((focus) => ({
			queryKey: queryKeys.taskSource(focus.id),
			queryFn: () => api<TaskDetail>(buildPath("task", { id: focus.id })),
			enabled: !focus.projectName,
		})),
	});
	// 任务分布面板当前模板（按状态/按优先级），默认按状态。
	const [distTemplate, setDistTemplate] = useState<DistTemplateId>("status");
	// —— 面板等高：以「最近活动」卡片为高度基准，反推「需要关注/项目速览」最多可显示行数 ——
	const activityCardRef = useRef<HTMLDivElement | null>(null);
	const focusRowRef = useRef<HTMLDivElement | null>(null);
	const projectRowRef = useRef<HTMLAnchorElement | null>(null);
	const [rowBudget, setRowBudget] = useState<{
		focus?: number;
		project?: number;
	}>({});
	useLayoutEffect(() => {
		if (!data) return;
		const measure = () => {
			const card = activityCardRef.current;
			if (!card) return;
			// 卡片高度 − 上下内边距(20×2) − 面板标题(14.5px 行高约 21 + mb-4 16)；留 8px 余量防溢出。
			const budget = card.getBoundingClientRect().height - 40 - 37 - 8;
			const next: { focus?: number; project?: number } = {};
			if (focusRowRef.current) {
				next.focus = Math.max(
					1,
					Math.floor(budget / focusRowRef.current.getBoundingClientRect().height),
				);
			}
			if (projectRowRef.current) {
				next.project = Math.max(
					1,
					Math.floor(budget / projectRowRef.current.getBoundingClientRect().height),
				);
			}
			setRowBudget((prev) => ({ ...prev, ...next }));
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [data]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	if (isError || !data) {
		return (
			<p className="py-16 text-center text-sm text-destructive">加载仪表盘失败</p>
		);
	}

	// 项目速览：全部工作区最近打开的 5 个（打开记录在进入看板时写入 localStorage）。
	// 一次求值，map 内复用（此前 map 内二次调用 getRecentProjectsAll）。
	const recentProjectEntries = getRecentProjectsAll(20).filter(
		(entry, index, entries) =>
			entries.findIndex((candidate) => candidate.projectId === entry.projectId) ===
			index,
	);
	const recentProjects =
		recentProjectEntries.length > 0
			? recentProjectEntries
					.map((r) => data.projects.find((p) => p.id === r.projectId))
					.filter((p) => p !== undefined)
			: data.projects.slice(0, 20);
	const distributionColumns = data.byColumn;
	const statusColumns = distributionColumns;
	// 固定展示四档优先级（紧急/高/中/低），缺失档位补 0——与「按状态」模板显示全部列的 0 值行一致。
	const priorityColumns = PRIORITIES.map((prio) => {
		const hit = data.byPriority.find(
			(c) => normalizePriority(c.priority) === prio,
		);
		return { name: PRIORITY_LABEL[prio], count: hit?.count ?? 0 };
	});
	const activeDistribution =
		distTemplate === "status" ? statusColumns : priorityColumns;

	return (
		<div className="kanso-dashboard flex h-full flex-col">
			<PageHeader>
				<h1 className="text-[17px] font-[650] tracking-tight">仪表盘</h1>
				<span className="text-[13px] text-muted-foreground">全部工作区 · 汇总</span>
			</PageHeader>

			<PageContent className="px-[30px] pb-7 pt-[26px]">
				{/* 统计卡 */}
				<div className="grid grid-cols-4 gap-3.5">
					<StatCard
						num={data.totalTasks}
						label="全部任务"
						trend={`完成 ${data.completionPercent}%`}
					/>
					<StatCard
						num={data.newThisWeek}
						label="本周新增"
						trend="过去 7 天"
						accent
					/>
					<StatCard num={data.urgent} label="紧急" trend="需要关注" warn />
					<StatCard num={data.projects.length} label="项目" trend="全部工作区" />
				</div>

				{/* 面板网格 */}
				<div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-3.5">
					{/* 完成进度 */}
					<SurfaceCard className="kanso-panel-card">
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
								<div className="text-sm font-medium">{data.doneTasks} 个任务已完成</div>
								<div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
									共 {data.totalTasks} 个任务 · 剩余 {data.totalTasks - data.doneTasks}{" "}
									个
								</div>
								<div className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
									已完成 = 位于看板末列的任务
								</div>
							</div>
						</div>
					</SurfaceCard>

					{/* 任务趋势 */}
					<SurfaceCard className="kanso-panel-card">
						<PanelTitle
							action={
								<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
									<span className="kanso-trend-range">本周</span>
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
						<TrendChart points={data.trend.slice(-7)} />
					</SurfaceCard>

					{/* 列分布（两种模板：按状态 / 按优先级，可切换） */}
					<SurfaceCard className="kanso-panel-card">
						<PanelTitle
							action={
								<Popover>
									<PopoverTrigger
										render={
											<Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
												<LayoutTemplateIcon className="size-3.5" />
												{DIST_TEMPLATES.find((t) => t.id === distTemplate)?.label ??
													"按状态"}
											</Button>
										}
									/>
									<PopoverPopup className="w-32 p-1" align="end">
										{DIST_TEMPLATES.map((t) => (
											<PopoverClose
												key={t.id}
												render={
													<button
														type="button"
														onClick={() => setDistTemplate(t.id)}
														className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent ${
															t.id === distTemplate
																? "font-medium text-[var(--semantic-action-primary)]"
																: "text-foreground"
														}`}
													>
														{t.label}
														{t.id === distTemplate ? (
															<CheckIcon className="size-3.5" />
														) : null}
													</button>
												}
											/>
										))}
									</PopoverPopup>
								</Popover>
							}
						>
							任务分布
						</PanelTitle>
						<div className="kanso-distribution-list">
							{activeDistribution.length === 0 ? (
								<p className="py-6 text-center text-xs text-muted-foreground">
									{distTemplate === "priority" ? "暂无优先级数据" : "暂无列数据"}
								</p>
							) : (
								<>
									{activeDistribution.map((c) => (
										<div key={c.name} className="kanso-distribution-list__row">
											<span className="kanso-distribution-list__name">{c.name}</span>
											<div className="kanso-distribution-list__track">
												<div
													className="kanso-distribution-list__fill"
													style={{
														width: `${data.totalTasks ? (c.count / data.totalTasks) * 100 : 0}%`,
													}}
												/>
											</div>
											<span className="kanso-distribution-list__count">{c.count}</span>
										</div>
									))}
								</>
							)}
						</div>
					</SurfaceCard>

					{/* 需要关注 */}
					<SurfaceCard className="kanso-panel-card">
						<PanelTitle>需要关注</PanelTitle>
						{data.focus.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								暂无紧急任务
							</p>
						) : (
							<div className="kanso-focus-list">
								{data.focus.slice(0, rowBudget.focus ?? 3).map((f, index) => (
									<div
										key={f.id}
										ref={index === 0 ? focusRowRef : undefined}
										className="kanso-focus-list__item"
									>
										<span className="kanso-focus-list__marker" aria-hidden="true" />
										<span className="kanso-focus-list__title">{f.title}</span>
										<span
											className="kanso-focus-list__project"
											title={
												f.projectName ||
												focusProjectQueries[index]?.data?.projectName ||
												"来源项目"
											}
										>
											{f.projectName ||
												focusProjectQueries[index]?.data?.projectName ||
												"来源项目"}
										</span>
										{f.dueDate ? (
											<span className="kanso-focus-list__due">
												<CalendarDaysIcon aria-hidden="true" />
												{f.dueDate}
											</span>
										) : null}
									</div>
								))}
							</div>
						)}
					</SurfaceCard>

					{/* 项目速览 */}
					<SurfaceCard className="kanso-panel-card">
						<PanelTitle>项目速览</PanelTitle>
						{recentProjects.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								打开过项目后会显示在这里
							</p>
						) : (
							recentProjects.slice(0, rowBudget.project ?? 5).map((p, index) => {
								const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
								const entry = recentProjectEntries.find((r) => r.projectId === p.id);
								const wsId = entry?.workspaceId ?? p.workspaceId;
								return (
									<Link
										key={p.id}
										ref={index === 0 ? projectRowRef : undefined}
										to={wsId ? `/w/${wsId}/p/${p.id}` : "#"}
										className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
									>
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{p.name}
										</span>
										<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
											{p.done}/{p.total} · {pct}%
										</span>
									</Link>
								);
							})
						)}
					</SurfaceCard>

					{/* 最近活动 */}
					<SurfaceCard className="kanso-panel-card" ref={activityCardRef}>
						<PanelTitle>最近活动</PanelTitle>
						{data.recentActivity.length === 0 ? (
							<p className="py-6 text-center text-xs text-muted-foreground">
								暂无活动
							</p>
						) : (
							<div className="kanso-recent-activity">
								{data.recentActivity.slice(0, 5).map((a) => {
									const Icon = activityIconForAction(a.action);
									return (
										<div className="kanso-recent-activity__row" key={a.id}>
											<span className="kanso-recent-activity__icon" aria-hidden="true">
												<Icon />
											</span>
											<div className="kanso-recent-activity__body">
												<ActivityItem
													projectName={a.projectName}
													action={a.action}
													data={a.data}
													actor={a.actor}
													className="block"
												/>
												<time className="kanso-recent-activity__time">
													{formatActivityAge(a.createdAt)}
												</time>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</SurfaceCard>
				</div>
			</PageContent>
		</div>
	);
}

// TrendChart 显示本周新增/完成双线折线图（手写 SVG，零依赖）。
function TrendChart({ points }: { points: DashboardData["trend"] }) {
	const W = 520;
	const H = 148;
	const PAD = 10;
	const PLOT_BOTTOM = 116;
	const LABEL_Y = 143;
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
	const y = (v: number) => PLOT_BOTTOM - (v / max) * (PLOT_BOTTOM - PAD);

	const line = (key: "created" | "completed") =>
		points
			.map(
				(p, i) =>
					`${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`,
			)
			.join(" ");
	const area = (key: "created" | "completed") =>
		`${line(key)} L${x(points.length - 1).toFixed(1)},${PLOT_BOTTOM} L${x(0).toFixed(1)},${PLOT_BOTTOM} Z`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-36 w-full text-foreground"
			role="img"
			aria-label="本周任务趋势"
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
					y1={PAD + (PLOT_BOTTOM - PAD) * t}
					y2={PAD + (PLOT_BOTTOM - PAD) * t}
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
			{points.map((point, index) => (
				<text
					key={point.day}
					x={x(index)}
					y={LABEL_Y}
					fontSize="10"
					fill="currentColor"
					opacity="0.55"
					textAnchor={
						index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
					}
				>
					{formatWeekday(point.day)}
				</text>
			))}
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
		<div className="kanso-dashboard__panel-title mb-4 flex items-center justify-between">
			<span className="font-semibold text-foreground">{children}</span>
			{action}
		</div>
	);
}

function StatCard(props: {
	num: number;
	label: string;
	trend: string;
	accent?: boolean;
	warn?: boolean;
}) {
	const { num, label, trend, accent, warn } = props;
	return (
		<div className="kanso-stat-card">
			<div
				className={`kanso-stat-card__num ${
					accent ? "text-primary" : warn ? "text-destructive" : ""
				}`}
			>
				{num}
			</div>
			<div className="kanso-stat-card__label">{label}</div>
			<div className="kanso-stat-card__trend">{trend}</div>
		</div>
	);
}

function formatWeekday(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return day.slice(5);
	return `周${["日", "一", "二", "三", "四", "五", "六"][date.getUTCDay()]}`;
}

// formatActivityAge 已提取至 lib/format-relative（S-11，与活动页共用）。
