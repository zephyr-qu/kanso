// 成员头像：上传图优先，无图时显示默认剪影图 + 底色。
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Member } from "@/types/member";

export function MemberAvatar({
	member,
	className,
}: {
	member: Member;
	className?: string;
}) {
	return (
		<Avatar
			className={className}
			style={{
				// 无自定义色时用主题色（不是按名字哈希取色）。
				backgroundColor: member.avatarColor ?? "var(--semantic-action-primary)",
			}}
		>
			<AvatarImage
				src={member.avatar ?? "/default-avatar.svg"}
				alt={member.name}
			/>
			<AvatarFallback>{member.name.slice(0, 2)}</AvatarFallback>
		</Avatar>
	);
}
