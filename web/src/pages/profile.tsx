// 个人中心：当前成员信息（可编辑名称）+ 个人活跃热力图 + 团队成员列表。
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon, UploadIcon } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import ConfirmDialog from "@/components/confirm-dialog";
import NameDialog from "@/components/name-dialog";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import { toastManager } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { avatarColor, AVATAR_COLORS } from "@/lib/avatar";
import { queryKeys } from "@/hooks/query-keys";
import type { Activity } from "@/types/task-detail";
import type { Member, MemberRole } from "@/types/member";
import type { MeResponse } from "@/types/me";

const ROLE_LABEL: Record<MemberRole, string> = {
	owner: "所有者",
	member: "成员",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 本地时区 YYYY-MM-DD（热力图按本地日历日归桶，不能用 toISOString 的 UTC 日期）。 */
function localDateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 个人活跃热力图：近 13 周按天计数（GitHub 风格），颜色按活动密度分级。 */
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
	const queryClient = useQueryClient();
	// 内联编辑名称（小操作不弹面板）：点编辑 → 输入框，Enter 保存，Esc/失焦取消。
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.me(),
		queryFn: () => api<MeResponse>(buildPath("me")),
	});
	const mode = data?.mode ?? "team";
	const { data: workspaces } = useQuery({
		queryKey: queryKeys.workspaces(),
		queryFn: () => api<{ id: string; name: string }[]>(buildPath("workspaces")),
	});
	const { data: members } = useQuery({
		queryKey: queryKeys.members(data?.workspaceId ?? ""),
		queryFn: () =>
			api<Member[]>(
				buildPath("workspaceMembers", { id: data?.workspaceId ?? "" }),
			),
		enabled: Boolean(data?.workspaceId) && mode === "team",
	});
	const { data: activities } = useQuery({
		queryKey: queryKeys.activities(),
		queryFn: () => api<Activity[]>(buildPath("activity")),
	});

	const updateMember = useMutation({
		meta: { feedback: { success: "个人资料已更新", errorTitle: "更新个人资料失败" } },
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
			queryClient.invalidateQueries({ queryKey: queryKeys.me() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.members(data?.workspaceId ?? ""),
			});
		},
	});
	// 成员管理：5 人上限（mock 层同步限制），所有者受保护不可删除。
	const [addOpen, setAddOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
	const memberCount = members?.length ?? 0;
	const memberLimit = 5;
	const atMemberLimit = memberCount >= memberLimit;
	const createMember = useMutation({
		meta: { feedback: { success: "成员已添加", errorTitle: "添加成员失败" } },
		mutationFn: (name: string) =>
			api<Member>(buildPath("members"), {
				method: "POST",
				body: JSON.stringify({ workspaceId: data?.workspaceId, name }),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.members(data?.workspaceId ?? ""),
			});
		},
	});
	const deleteMemberMutation = useMutation({
		meta: { feedback: { success: "成员已移除", errorTitle: "移除成员失败" } },
		mutationFn: (memberId: string) =>
			api<void>(buildPath("member", { id: memberId }), { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.members(data?.workspaceId ?? ""),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.me() });
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
	const canManageMembers = member?.role === "owner";
	const workspaceName =
		workspaces?.find((w) => w.id === data?.workspaceId)?.name ?? "";

	return (
		<div className="flex h-full flex-col">
			<PageHeader>
				<h1 className="text-[17px] font-[650] tracking-tight">个人中心</h1>
			</PageHeader>
			<PageContent className="px-[30px] pb-11 pt-[26px]">
				{isLoading || !member ? (
					<div className="flex justify-center py-16">
						<Spinner />
					</div>
				) : (
					<div className="w-full space-y-4">
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
													className={`size-8 rounded-full transition-transform hover:scale-110 ${(member.avatarColor ?? avatarColor(member.name)) === color ? "ring-2 ring-ring ring-offset-2" : ""}`}
													style={{ backgroundColor: color }}
												/>
											))}
										</div>
									</PopoverPopup>
								</Popover>
							) : (
								// personal 模式：PATCH /api/members/{id} 双模式注册，头像可改（仅 owner 单成员）。
								<MemberAvatar
									member={member}
									className="size-14 text-lg font-semibold text-white"
								/>
							)}
							<div
								className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									{editing ? (
										<input
											value={draft}
											onChange={(e) => setDraft(e.target.value)}
											autoFocus
											onFocus={(e) => e.target.select()}
											onKeyDown={(e) => {
												// 未改名直接退出编辑（避免对保留名 Admin 的无谓 PATCH）。
												if (e.key === "Enter" && draft.trim() && draft.trim() !== member.name) {
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

						{/* 个人活跃热力图 */}
						<SurfaceCard className="p-5">
							<div className="mb-3 flex items-center justify-between">
								<span className="text-[13px] font-semibold">个人活跃</span>
							</div>
							<ActivityHeatmap activities={activities ?? []} />
						</SurfaceCard>

						{/* 团队成员（仅团队模式；personal 无成员表，ADR-0013） */}
						{mode === "team" ? (
							<SurfaceCard className="p-5">
								<div className="mb-3 flex items-center justify-between">
									<span className="text-[13px] font-semibold">团队成员</span>
									<div className="flex items-center gap-2.5">
										<span className="text-xs text-muted-foreground/80">
											{memberCount}/{memberLimit} 人
										</span>
										<Button
											size="sm"
											onClick={() => setAddOpen(true)}
											disabled={!canManageMembers || atMemberLimit}
											title={
												canManageMembers
													? atMemberLimit
														? `成员数量已达上限（${memberLimit} 人）`
														: undefined
													: "只有所有者可以管理成员"
											}
										>
											<PlusIcon className="size-3.5" /> 增加成员
										</Button>
									</div>
								</div>
								<ul className="space-y-1">
									{(members ?? []).map((m) => (
										<li
											key={m.id}
											className="flex items-center gap-3 rounded-lg px-2 py-2"
										>
											<MemberAvatar
												member={m}
												className="size-8 text-sm font-semibold text-white"
											/>
											<span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
											<span className="shrink-0 text-xs text-muted-foreground/70">
												{ROLE_LABEL[m.role]}
											</span>
											{canManageMembers ? (
												<MemberKeyButton memberId={m.id} isOwner={m.role === "owner"} />
											) : null}
											{canManageMembers && m.role !== "owner" ? (
												<Button
													size="icon-sm"
													variant="ghost"
													className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													aria-label={`删除成员 ${m.name}`}
													onClick={() => setDeleteTarget(m)}
												>
													<TrashIcon className="size-3.5" />
												</Button>
											) : null}
										</li>
									))}
								</ul>
								<p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground/70">
									管理员（所有者）使用后台密钥登录；其他成员由管理员分配密钥进入。密钥在成员行点击生成。
								</p>
							</SurfaceCard>
						) : null}
					</div>
				)}
			</PageContent>
			<NameDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				title="添加成员"
				description={`为工作区添加协作者（上限 ${memberLimit} 人）。`}
				submitLabel="添加"
				onSubmit={async (name) => {
					await createMember.mutateAsync(name);
				}}
			/>
			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title="删除成员"
				description={`确定删除成员「${deleteTarget?.name ?? ""}」？删除后其访问密钥立即失效。`}
				confirmLabel="删除"
				onConfirm={async () => {
					if (deleteTarget) await deleteMemberMutation.mutateAsync(deleteTarget.id);
				}}
			/>
		</div>
	);
}

/** 成员访问密钥：管理员查看后台密钥；成员生成密钥 → 复制完成授权。 */
function MemberKeyButton({
	memberId,
	isOwner,
}: {
	memberId: string;
	isOwner: boolean;
}) {
	const [key, setKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(false);

	const generate = async () => {
		if (loading) return;
		setLoading(true);
		try {
			const res = await api<{ key: string }>(
				buildPath("memberKey", { id: memberId }),
				{ method: "POST" },
			);
			setKey(res.key);
		} catch (error) {
			// W-8：密钥生成失败给出反馈（此前为未处理的 promise rejection）。
			toastManager.add({
				title: "生成密钥失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	const copy = async () => {
		if (!key) return;
		try {
			// 部分环境（无头/权限弹窗）writeText 可能挂起，500ms 超时走兜底
			await Promise.race([
				navigator.clipboard.writeText(key),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("clipboard timeout")), 500),
				),
			]);
		} catch {
			// 兜底：临时 textarea + execCommand
			const textarea = document.createElement("textarea");
			textarea.value = key;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			textarea.remove();
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	if (!key) {
		return (
			<Button
				size="sm"
				variant="outline"
				className="shrink-0 text-xs text-[var(--semantic-action-primary)]"
				onClick={generate}
				loading={loading}
			>
				{isOwner ? "后台密钥" : "生成密钥"}
			</Button>
		);
	}
	return (
		<span className="flex shrink-0 items-center gap-1.5">
			<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
				{key}
			</code>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0 text-xs text-[var(--semantic-action-primary)]"
				onClick={copy}
			>
				{copied ? "已复制" : "复制"}
			</Button>
		</span>
	);
}
