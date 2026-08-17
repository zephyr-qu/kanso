// 成员头像：上传图优先，无图时显示首字母 + 底色。
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColor } from "@/lib/avatar";
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
				backgroundColor: member.avatarColor ?? avatarColor(member.name),
			}}
		>
			{member.avatar ? (
				<AvatarImage src={member.avatar} alt={member.name} />
			) : null}
			<AvatarFallback>{member.name.slice(0, 2)}</AvatarFallback>
		</Avatar>
	);
}
