// 个人中心：当前成员信息（可编辑名称）+ 个人活跃热力图。
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
	ActivityIcon,
	AlertTriangleIcon,
	ArrowRightIcon,
	CheckCircle2Icon,
	HistoryIcon,
	ListTodoIcon,
	PencilIcon,
	ShieldCheckIcon,
	UploadIcon,
	type LucideIcon,
} from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { MemberKeyButton } from "@/components/member-key-button";
import ActivityItem from "@/components/activity-item";
import { activityIconForAction } from "@/components/activity-icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { AVATAR_COLORS } from "@/lib/avatar";
import { formatActivityAge } from "@/lib/format-relative";
import { invalidateMe, queryKeys } from "@/hooks/query-keys";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import type { DashboardData } from "@/lib/dashboard";
import type { Activity } from "@/types/task-detail";
import type { Member, MemberRole } from "@/types/member";
import type { MeResponse } from "@/types/me";

const ROLE_LABEL: Record<MemberRole, string> = {
	admin: "管理员",
	member: "成员",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 本地时区 YYYY-MM-DD（热力图按本地日历日归桶，不能用 toISOString 的 UTC 日期）。 */
function localDateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 个人活跃热力图：近一年按天计数（GitHub 风格），颜色按活动密度分级。 */
function ActivityHeatmap({ activities }: { activities: Activity[] }) {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	// 对齐当前周起点（周日）再向前取满 52 周，避免最后一列缺天数。
	const weekStart = new Date(today);
	weekStart.setDate(today.getDate() - today.getDay());
	const start = new Date(weekStart);
	start.setDate(weekStart.getDate() - 51 * 7);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	const dayCount =
		Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;

	const counts = new Map<string, number>();
	for (const a of activities) {
		const d = new Date(a.createdAt);
		if (d >= start && d < tomorrow) {
			const key = localDateKey(d);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
	const maxCount = Math.max(1, ...counts.values());

	// columns[周][星期几]（0=周日），首尾周可能不满 7 天
	const columns: ({ date: Date; count: number } | null)[][] = [];
	for (let i = 0; i < dayCount; i++) {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		const key = localDateKey(date);
		const week = Math.floor(i / 7);
		if (!columns[week]) columns[week] = Array.from({ length: 7 }, () => null);
		columns[week][date.getDay()] = { date, count: counts.get(key) ?? 0 };
	}

	// 月份标签：列首月与上一列不同时标注
	const monthLabels: (string | null)[] = columns.map((column, wi) => {
		const first = column.find((cell) => cell !== null);
		if (!first) return null;
		if (wi === 0) return null; // 跨年区间首尾同为 8 月，跳过开头标签避免重复
		const month = first.date.getMonth();
		const prev = wi === 0 ? null : columns[wi - 1].find((cell) => cell !== null);
		return prev && prev.date.getMonth() === month ? null : `${month + 1}月`;
	});

	function cellColor(count: number): string {
		if (count === 0) return "var(--semantic-surface-muted)";
		const pct = Math.min(30 + (count / maxCount) * 70, 100);
		return `color-mix(in srgb, var(--semantic-action-primary) ${pct}%, transparent)`;
	}

	return (
		<div className="w-full">
			{/* 月份标签行（52 列对齐） */}
			<div className="mb-[3px] flex gap-[3px] pl-7">
				{monthLabels.map((label, index) => (
					<span
						key={index}
						className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-[9px] leading-none text-muted-foreground/70"
					>
						{label ?? ""}
					</span>
				))}
			</div>
			<div className="flex items-stretch gap-[3px]">
				{/* 星期标签：GitHub 风格仅标 一/三/五，flex-1 与格子行对齐 */}
				<div className="flex w-7 flex-col gap-[3px]">
					{Array.from({ length: 7 }, (_, dow) => (
						<span
							key={dow}
							className={`flex flex-1 items-center text-[9px] leading-none text-muted-foreground/70 ${dow === 1 || dow === 3 || dow === 5 ? "" : "invisible"}`}
						>
							{WEEKDAY_LABELS[dow]}
						</span>
					))}
				</div>
				{/* 52 周 × 7 天网格：列 flex-1 均分，格子 aspect-square 随卡片自适应 */}
				<div className="flex min-w-0 flex-1 gap-[3px]">
					{columns.map((column, wi) => (
						<div key={wi} className="flex min-w-0 flex-1 flex-col gap-[3px]">
							{Array.from({ length: 7 }, (_, di) => {
								const cell = column[di];
								return cell ? (
									<span
										key={di}
										title={`${localDateKey(cell.date)} · ${cell.count} 次活动`}
										className="aspect-square w-full rounded-[2px]"
										style={{ backgroundColor: cellColor(cell.count) }}
									/>
								) : (
									<span
										key={di}
										className="aspect-square w-full rounded-[2px]"
										style={{ backgroundColor: "var(--semantic-surface-muted)" }}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>
			{/* 图例 */}
			<div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground/70">
				<span>少</span>
				{[0.08, 0.35, 0.6, 0.85].map((ratio) => (
					<span
						key={ratio}
						className="size-[11px] rounded-[2px]"
						style={{
							backgroundColor: `color-mix(in srgb, var(--semantic-action-primary) ${Math.round(ratio * 100)}%, transparent)`,
						}}
					/>
				))}
				<span>多</span>
				<span className="ml-3">近一年 · {total} 次活动</span>
			</div>
		</div>
	);
}

export default function ProfilePage() {
	const { workspaceId = "" } = useParams();
	const { currentWorkspace: workspace } = useWorkspaceContext();
	const queryClient = useQueryClient();
	// 内联编辑名称（小操作不弹面板）：点编辑 → 输入框，Enter 保存，Esc/失焦取消。
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.me(),
		queryFn: () => api<MeResponse>(buildPath("me")),
	});
	const mode = data?.mode ?? "team";
	const { data: activities } = useQuery({
		queryKey: queryKeys.activities(workspaceId),
		queryFn: () => api<Activity[]>(buildPath("activity", { workspaceId })),
		enabled: Boolean(workspaceId),
	});
	const { data: dashboard } = useQuery({
		queryKey: queryKeys.dashboard(workspaceId),
		queryFn: () => api<DashboardData>(buildPath("dashboard", { workspaceId })),
		enabled: Boolean(workspaceId),
	});
	const { data: teamMembers } = useQuery({
		queryKey: queryKeys.members(workspaceId),
		queryFn: () =>
			api<Member[]>(buildPath("workspaceMembers", { id: workspaceId })),
		enabled: mode === "team" && Boolean(workspaceId),
	});

	const updateMember = useMutation({
		meta: {
			feedback: { success: "个人资料已更新", errorTitle: "更新个人资料失败" },
		},
		mutationFn: (patch: {
			name?: string;
			avatarColor?: string;
			avatar?: string | null;
		}) =>
			api<Member>(buildPath("member", { id: data?.member.id ?? "" }), {
				method: "PATCH",
				body: JSON.stringify(patch),
			}),
		onSuccess: () => {
			invalidateMe(queryClient);
		},
	});
	const fileRef = useRef<HTMLInputElement>(null);
	// 头像上传：读取文件 → 缩到 128px → data URL 存成员（mock 存 localStorage，避免大图撑爆）。
	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const scale = Math.min(1, 128 / Math.max(img.width, img.height));
				canvas.width = Math.max(1, Math.round(img.width * scale));
				canvas.height = Math.max(1, Math.round(img.height * scale));
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					updateMember.mutate({ avatar: dataUrl });
					return;
				}
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				updateMember.mutate({ avatar: canvas.toDataURL("image/jpeg", 0.85) });
			};
			img.onerror = () => updateMember.mutate({ avatar: dataUrl });
			img.src = dataUrl;
		};
		reader.readAsDataURL(file);
	};

	const member = data?.member;
	const workspaceName = workspace?.name ?? "";
	const activityActor = mode === "team" ? member?.name : "Admin";
	const myActivities = (activities ?? []).filter(
		(activity) => !activityActor || activity.actor === activityActor,
	);
	const recentActivities = myActivities.slice(0, 5);
	const recentActivityCount = myActivities.filter(
		(activity) =>
			Date.now() - new Date(activity.createdAt).getTime() <= 7 * 86_400_000,
	).length;
	const inProgressTasks = dashboard
		? Math.max(0, dashboard.totalTasks - dashboard.doneTasks)
		: null;

	return (
		<div className="flex h-full flex-col">
			<PageHeader>
				<h1 className="text-[17px] font-[650] tracking-tight">个人中心</h1>
				<span className="text-[13px] text-muted-foreground">
					当前成员 · 资料、活动与安全
				</span>
			</PageHeader>
			<PageContent className="px-[30px] pb-11 pt-[26px]">
				{isLoading || !member ? (
					<div className="flex justify-center py-16">
						<Spinner />
					</div>
				) : (
					<div className="w-full max-w-5xl space-y-4">
						{/* 当前成员卡 */}
						<SurfaceCard className="flex items-center gap-4 p-5">
							{editing ? (
								<button
									type="button"
									className="group relative shrink-0"
									aria-label="上传头像"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => fileRef.current?.click()}
								>
									<MemberAvatar
										member={member}
										className="size-14 text-lg font-semibold text-white"
									/>
									<span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white opacity-100">
										<UploadIcon className="size-4" />
									</span>
								</button>
							) : mode === "team" ? (
								<Popover>
									<PopoverTrigger
										render={
											<button
												type="button"
												className="group relative shrink-0"
												aria-label="修改头像"
											>
												<MemberAvatar
													member={member}
													className="size-14 text-lg font-semibold text-white"
												/>
												<span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
													<PencilIcon className="size-3" />
												</span>
											</button>
										}
									/>
									<PopoverPopup className="w-fit p-2.5" align="start">
										<p className="mb-2 px-0.5 text-[11px] text-muted-foreground">
											头像颜色
										</p>
										<div className="flex gap-2">
											{AVATAR_COLORS.map((color) => (
												<button
													key={color}
													type="button"
													aria-label={`头像颜色 ${color}`}
													onClick={() => updateMember.mutate({ avatarColor: color })}
													className={`size-8 rounded-full transition-transform hover:scale-110 ${member.avatarColor === color ? "ring-2 ring-ring ring-offset-2" : ""}`}
													style={{ backgroundColor: color }}
												/>
											))}
										</div>
									</PopoverPopup>
								</Popover>
							) : (
								// personal 模式：PATCH /api/members/{id} 双模式注册，头像可改（仅管理员单成员）。
								<MemberAvatar
									member={member}
									className="size-14 text-lg font-semibold text-white"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									{editing ? (
										<input
											value={draft}
											onChange={(e) => setDraft(e.target.value)}
											autoFocus
											onFocus={(e) => e.target.select()}
											onKeyDown={(e) => {
												// 未改名直接退出编辑（避免对保留名 Admin 的无谓 PATCH）。
												if (
													e.key === "Enter" &&
													draft.trim() &&
													draft.trim() !== member.name
												) {
													updateMember.mutate({ name: draft.trim() });
													setEditing(false);
												} else if (e.key === "Enter") {
													setEditing(false);
												} else if (e.key === "Escape") {
													setEditing(false);
												}
											}}
											className="h-7 w-40 rounded-md border border-primary px-2 text-[16px] font-[650] tracking-tight outline-none"
											aria-label="编辑名称"
										/>
									) : (
										<span className="text-[16px] font-[650] tracking-tight">
											{member.name}
										</span>
									)}
									<span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
										{ROLE_LABEL[member.role]}
									</span>
								</div>
								<p className="mt-0.5 text-[13px] text-muted-foreground">
									{workspaceName}
								</p>
								{editing ? (
									<div className="mt-2 flex items-center gap-2">
										{member.avatar ? (
											<Button
												size="sm"
												variant="ghost"
												onClick={() => updateMember.mutate({ avatar: null })}
											>
												移除头像
											</Button>
										) : null}
										<input
											ref={fileRef}
											type="file"
											accept="image/*"
											className="hidden"
											onChange={onFileChange}
										/>
									</div>
								) : null}
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									if (editing) {
										setEditing(false);
									} else {
										// 两种模式均可编辑：personal = 单独管理员（成员表），改名走 PATCH /api/members/{id}。
										setDraft(member.name);
										setEditing(true);
									}
								}}
							>
								{editing ? (
									"取消"
								) : (
									<>
										<PencilIcon /> 编辑
									</>
								)}
							</Button>
						</SurfaceCard>

						{/* 工作区概览：任务没有分配人，因此这里明确标注为工作区数据。 */}
						<div>
							<div className="mb-2 flex items-center justify-between">
								<span className="text-[13px] font-semibold">工作区概览</span>
								<span className="text-xs text-muted-foreground/70">当前工作区</span>
							</div>
							<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
								<ProfileStat
									icon={ListTodoIcon}
									label="进行中"
									value={inProgressTasks}
								/>
								<ProfileStat
									icon={CheckCircle2Icon}
									label="已完成"
									value={dashboard?.doneTasks ?? null}
								/>
								<ProfileStat
									icon={AlertTriangleIcon}
									label="需关注"
									value={dashboard?.urgent ?? null}
								/>
								<ProfileStat
									icon={ActivityIcon}
									label="近 7 天活动"
									value={recentActivityCount}
								/>
							</div>
						</div>

						<div
							className={`grid gap-4 ${mode === "team" ? "lg:grid-cols-[1.2fr_0.8fr]" : ""}`}
						>
							{/* 我的最近活动 */}
							<SurfaceCard className="p-5">
								<div className="mb-3 flex items-center justify-between">
									<div>
										<h2 className="text-[13px] font-semibold">我的最近活动</h2>
										<p className="mt-1 text-xs text-muted-foreground/70">
											最近参与的项目操作
										</p>
									</div>
									<HistoryIcon className="size-4 text-muted-foreground/55" />
								</div>
								{recentActivities.length > 0 ? (
									<div className="divide-y">
										{recentActivities.map((activity) => {
											const Icon = activityIconForAction(activity.action);
											return (
												<div
													key={activity.id}
													className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
												>
													<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
														<Icon className="size-3.5" />
													</span>
													<div className="min-w-0 flex-1">
														<ActivityItem
															projectName={activity.projectName}
															action={activity.action}
															data={activity.data}
															actor="你"
															className="block text-[13px]"
														/>
														<p className="mt-1 text-[11px] text-muted-foreground/70">
															{formatActivityAge(activity.createdAt)}
														</p>
													</div>
												</div>
											);
										})}
									</div>
								) : (
									<div className="flex flex-col items-center justify-center py-8 text-center">
										<HistoryIcon className="size-5 text-muted-foreground/45" />
										<p className="mt-2 text-sm text-muted-foreground">还没有个人活动</p>
										<p className="mt-1 text-xs text-muted-foreground/70">
											开始编辑任务后，这里会显示你的操作。
										</p>
									</div>
								)}
							</SurfaceCard>

							{mode === "team" ? (
								<SurfaceCard className="p-5">
									<div className="flex items-start justify-between gap-3">
										<div>
											<h2 className="text-[13px] font-semibold">账号与安全</h2>
											<p className="mt-1 text-xs text-muted-foreground/70">
												管理当前成员的访问凭证
											</p>
										</div>
										<ShieldCheckIcon className="size-4 text-primary" />
									</div>
									<div className="mt-4 space-y-2.5">
										<SecurityMeta
											label="所属工作区"
											value={workspaceName || "当前工作区"}
										/>
										<SecurityMeta label="团队角色" value={ROLE_LABEL[member.role]} />
										<SecurityMeta
											label="团队成员"
											value={`${teamMembers?.length ?? "—"} / 5 人`}
										/>
										<div className="flex items-center justify-between gap-3 border-t pt-3">
											<div className="min-w-0">
												<p className="text-sm font-medium">访问密钥</p>
												<p
													className={`mt-1 text-xs ${member.hasKey ? "text-emerald-600" : "text-amber-600"}`}
												>
													{member.hasKey ? "已授权，可正常登录" : "未授权，需要生成密钥"}
												</p>
											</div>
											<MemberKeyButton
												memberId={member.id}
												hasKey={member.hasKey}
												isSelf
												canRotate
												onRotated={() => {
													invalidateMe(queryClient);
												}}
											/>
										</div>
									</div>
									<div className="mt-4 rounded-lg bg-muted/55 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
										密钥只在生成时显示一次；轮换后，旧密钥会立即失效。
									</div>
									<Link
										to="/team"
										className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
									>
										<span>前往团队管理</span>
										<ArrowRightIcon className="size-3.5" />
									</Link>
								</SurfaceCard>
							) : null}
						</div>

						<SurfaceCard className="p-5">
							<div className="mb-3 flex items-center justify-between">
								<div>
									<h2 className="text-[13px] font-semibold">个人活跃</h2>
									<p className="mt-1 text-xs text-muted-foreground/70">
										只统计你的操作记录
									</p>
								</div>
								<ActivityIcon className="size-4 text-muted-foreground/55" />
							</div>
							<div className="overflow-x-auto">
								<div className="min-w-[680px]">
									<ActivityHeatmap activities={myActivities} />
								</div>
							</div>
						</SurfaceCard>
					</div>
				)}
			</PageContent>
		</div>
	);
}

function SecurityMeta({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="truncate text-right font-medium text-foreground">
				{value}
			</span>
		</div>
	);
}

function ProfileStat({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: number | null;
}) {
	return (
		<SurfaceCard className="flex items-center gap-3 p-4">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<Icon className="size-4" />
			</span>
			<div className="min-w-0">
				<div className="text-lg font-semibold tracking-tight">{value ?? "—"}</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">{label}</div>
			</div>
		</SurfaceCard>
	);
}
