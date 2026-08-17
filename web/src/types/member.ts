// 成员模型（轻量）：1-3 人小团队场景。
// 角色仅两级：owner（工作区所有者）/ member（普通成员），后续需要第三级再加。
export type MemberRole = "owner" | "member";

export type Member = {
	id: string;
	workspaceId: string;
	name: string;
	role: MemberRole;
	/** 头像底色（轻量方案）；缺省按名字取色。 */
	avatarColor?: string;
	/** 上传的头像（data URL）；缺省显示首字母 + 底色。 */
	avatar?: string;
};
