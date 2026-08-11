// 相对时间文案（原型项目卡片 meta："更新于今天 / 昨天 / N 天前 / N 周前"）。
export function formatUpdated(iso: string, now = Date.now()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "更新于今天";
	const days = Math.floor((now - d.getTime()) / 86_400_000);
	if (days <= 0) return "更新于今天";
	if (days === 1) return "更新于昨天";
	if (days < 7) return `更新于 ${days} 天前`;
	return `更新于 ${Math.floor(days / 7)} 周前`;
}
