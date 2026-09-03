import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheckIcon, TrashIcon, UserPlusIcon } from "lucide-react";
import ConfirmDialog from "@/components/confirm-dialog";
import { MemberAvatar } from "@/components/member-avatar";
import { MemberKeyButton } from "@/components/member-key-button";
import NameDialog from "@/components/name-dialog";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { invalidateWorkspaceMembers, queryKeys } from "@/hooks/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import type { Member, MemberRole } from "@/types/member";
import type { MeResponse } from "@/types/me";

const ROLE_LABEL: Record<MemberRole, string> = { admin: "管理员", member: "成员" };

export default function TeamPage() {
	const { workspaceId = "" } = useParams();
	const { workspace } = useWorkspaceContext();
	const queryClient = useQueryClient();
	const [addOpen, setAddOpen] = useState(false);
	const [grantTarget, setGrantTarget] = useState("");
	const [actionTarget, setActionTarget] = useState<{ member: Member; action: "remove" | "delete" | "role" } | null>(null);
	const { data: meData, isLoading: meLoading } = useQuery({ queryKey: queryKeys.me(), queryFn: () => api<MeResponse>(buildPath("me")) });
	const { data: members, isLoading: membersLoading } = useQuery({
		queryKey: queryKeys.members(workspaceId),
		queryFn: () => api<Member[]>(buildPath("workspaceMembers", { id: workspaceId })),
		enabled: Boolean(workspaceId),
	});
	useRealtime(workspaceId, { scope: "workspace" });
	const isAdmin = meData?.member.role === "admin";
	const { data: globalMembers } = useQuery({
		queryKey: queryKeys.globalMembers(),
		queryFn: () => api<Member[]>(buildPath("members")),
		enabled: isAdmin,
	});
	const workspaceName = workspace?.name;
	const currentMemberIDs = new Set((members ?? []).map((item) => item.id));
	const availableMembers = (globalMembers ?? []).filter((item) => !currentMemberIDs.has(item.id));
	const adminCount = (members ?? []).filter((item) => item.role === "admin").length;
	const invalidateMembers = () => invalidateWorkspaceMembers(queryClient, workspaceId);
	const createMember = useMutation({
		meta: { feedback: { success: "成员已创建并授权", errorTitle: "添加成员失败" } },
		mutationFn: async (name: string) => {
			const member = await api<Member>(buildPath("members"), { method: "POST", body: JSON.stringify({ name }) });
			await api<void>(buildPath("workspaceMembers", { id: workspaceId }), { method: "POST", body: JSON.stringify({ memberId: member.id }) });
		},
		onSuccess: invalidateMembers,
	});
	const grantAccess = useMutation({
		meta: { feedback: { success: "成员已授权进入当前工作区", errorTitle: "授权成员失败" } },
		mutationFn: (memberId: string) => api<void>(buildPath("workspaceMembers", { id: workspaceId }), { method: "POST", body: JSON.stringify({ memberId }) }),
		onSuccess: () => { setGrantTarget(""); invalidateMembers(); },
	});
	const removeAccess = useMutation({
		meta: { feedback: { success: "已移出当前工作区", errorTitle: "移除授权失败" } },
		mutationFn: (memberId: string) => api<void>(`/api/workspaces/${workspaceId}/members/${memberId}`, { method: "DELETE" }),
		onSuccess: invalidateMembers,
	});
	const deleteMember = useMutation({
		meta: { feedback: { success: "成员身份已删除", errorTitle: "删除成员失败" } },
		mutationFn: (memberId: string) => api<void>(buildPath("member", { id: memberId }), { method: "DELETE" }),
		onSuccess: invalidateMembers,
	});
	const updateRole = useMutation({
		meta: { feedback: { success: "角色已更新", errorTitle: "更新角色失败" } },
		mutationFn: ({ memberId, role }: { memberId: string; role: MemberRole }) => api<Member>(`/api/members/${memberId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
		onSuccess: invalidateMembers,
	});

	if (meLoading || membersLoading || !meData?.member) return <div className="flex h-full flex-col"><PageHeader><h1 className="text-[17px] font-[650]">团队</h1></PageHeader><PageContent className="px-[30px] pt-[26px]"><div className="flex justify-center py-16"><Spinner /></div></PageContent></div>;
	if (meData.mode === "personal") return <Navigate to={`/w/${workspaceId}/profile`} replace />;

	return <div className="flex h-full flex-col">
		<PageHeader><h1 className="text-[17px] font-[650] tracking-tight">团队</h1><span className="text-[13px] text-muted-foreground">{workspaceName ?? "当前工作区"} · 成员与访问权限</span></PageHeader>
		<PageContent className="px-[30px] pb-11 pt-[26px]"><div className="w-full space-y-4">
			<SurfaceCard className="flex items-start gap-3 border-primary/20 bg-primary/[0.03] p-4"><ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" /><div className="text-[13px] leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">权限说明</strong><p>管理员自动拥有全部工作区权限；实例最多 2 名管理员；普通成员只有被授权的工作区可见，当前列表仅展示本工作区成员。</p></div></SurfaceCard>
			<SurfaceCard className="p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-[13px] font-semibold">当前工作区成员</h2><p className="mt-1 text-xs text-muted-foreground">{members?.length ?? 0} 人 · 管理员 {adminCount}/2 · 实例最多 6 个身份 · 密钥仅在轮换成功后显示一次</p></div>{isAdmin ? <Button size="sm" onClick={() => setAddOpen(true)}><UserPlusIcon className="size-3.5" /> 添加成员</Button> : null}</div>
				{isAdmin && availableMembers.length > 0 ? <div className="mb-4 flex items-center gap-2 rounded-md border border-dashed p-3"><select className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" value={grantTarget} onChange={(event) => setGrantTarget(event.target.value)}><option value="">授权已有成员进入当前工作区…</option>{availableMembers.map((item) => <option key={item.id} value={item.id}>{item.name} · {ROLE_LABEL[item.role]}</option>)}</select><Button size="sm" variant="outline" disabled={!grantTarget || grantAccess.isPending} onClick={() => grantAccess.mutate(grantTarget)}>授权进入</Button></div> : null}
				<ul className="divide-y">{(members ?? []).map((item) => { const isSelf = item.id === meData.member.id; const isAdminItem = item.role === "admin"; return <li key={item.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><MemberAvatar member={item} className="size-9 text-sm font-semibold text-white" /><div className="min-w-[120px] flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{item.name}</span>{isSelf ? <span className="text-[11px] text-muted-foreground">你</span> : null}</div><div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span>{ROLE_LABEL[item.role]}</span><span className={item.hasKey ? "text-emerald-600" : "text-amber-600"}>{item.hasKey ? "已授权" : "未授权"}</span></div></div><MemberKeyButton memberId={item.id} hasKey={item.hasKey} isSelf={isSelf} canRotate={isAdmin || isSelf} onRotated={invalidateMembers} />{isAdmin && !isAdminItem ? <>{adminCount < 2 ? <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setActionTarget({ member: item, action: "role" })}>提升管理员</Button> : <span className="text-xs text-muted-foreground">管理员名额已满</span>}<Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setActionTarget({ member: item, action: "remove" })}>移出工作区</Button><Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`删除成员 ${item.name}`} onClick={() => setActionTarget({ member: item, action: "delete" })}><TrashIcon className="size-3.5" /></Button></> : null}</li>; })}</ul>
			</SurfaceCard>
		</div></PageContent>
		<NameDialog open={addOpen} onOpenChange={setAddOpen} title="添加成员" description="创建一个全局成员身份，并授权其进入当前工作区。" submitLabel="添加" onSubmit={async (name) => { await createMember.mutateAsync(name); }} />
		<ConfirmDialog open={actionTarget !== null} onOpenChange={(open) => { if (!open) setActionTarget(null); }} title={actionTarget?.action === "remove" ? "移出工作区" : actionTarget?.action === "role" ? "提升管理员" : "删除成员身份"} description={actionTarget?.action === "remove" ? `确定移出「${actionTarget.member.name}」？其仍可保留其他工作区权限。` : actionTarget?.action === "role" ? `确定将「${actionTarget.member.name}」提升为管理员？管理员将自动获得全部工作区权限。` : `确定删除「${actionTarget?.member.name ?? ""}」的全局成员身份？其全部工作区授权和访问密钥都会立即失效。`} confirmLabel={actionTarget?.action === "remove" ? "移出工作区" : actionTarget?.action === "role" ? "提升" : "删除"} onConfirm={async () => { if (!actionTarget) return; if (actionTarget.action === "remove") await removeAccess.mutateAsync(actionTarget.member.id); else if (actionTarget.action === "role") await updateRole.mutateAsync({ memberId: actionTarget.member.id, role: "admin" }); else await deleteMember.mutateAsync(actionTarget.member.id); }} />
	</div>;
}
