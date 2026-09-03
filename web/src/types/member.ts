// 成员是实例级全局身份；工作区授权由 workspace_member 单独表达。
export type MemberRole = "admin" | "member";

export type Member = {
	id: string;
	name: string;
	role: MemberRole;
	/** 是否存在可用于登录的访问密钥；不会返回明文或哈希。 */
	hasKey: boolean;
	/** 头像底色（轻量方案）；缺省按名字取色。 */
	avatarColor?: string;
	/** 上传的头像（data URL）；缺省显示首字母 + 底色。 */
	avatar?: string;
};
