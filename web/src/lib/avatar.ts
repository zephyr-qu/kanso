// 头像底色：按名字稳定取色（轻量方案，不做头像上传）。
export const AVATAR_COLORS = [
	"#e76f51", // 陶土
	"#2a9d8f", // 青绿
	"#e9c46a", // 沙金
	"#457b9d", // 灰蓝
];

export function avatarColor(name: string): string {
	let hash = 0;
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
