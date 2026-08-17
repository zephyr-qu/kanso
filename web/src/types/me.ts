// /api/me 响应契约：当前身份 + 运行模式（ADR-0013）。
// mode 决定前端成员管理显隐：personal 无成员表（固定 Admin 身份），team 多成员。
import type { Member } from "./member";

export type KansoMode = "personal" | "team";

export type MeResponse = {
	member: Member;
	/** 团队模式下为成员所属工作区；personal 模式为空串。 */
	workspaceId: string;
	mode: KansoMode;
};
