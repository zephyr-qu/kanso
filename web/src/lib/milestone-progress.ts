// 里程碑进度（单一真相源）：看板进度卡、管理弹窗、分享卡、详情弹窗共用，避免四处各算导致口径漂移。
import type { Milestone } from "@/types/board";

/** 里程碑完成百分比：空/无进度返回 0，否则四舍五入。 */
export function progressPct(m: Milestone | null | undefined): number {
	if (!m?.progress || m.progress.total <= 0) return 0;
	return Math.round((m.progress.done / m.progress.total) * 100);
}
