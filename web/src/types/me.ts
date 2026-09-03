// /api/me 响应契约：当前身份 + 运行模式（ADR-0013）。
// mode 只影响界面简化；权限以 member.role 和工作区授权为准。
import type { Member } from "./member";

export type KansoMode = "personal" | "team";

export type MeResponse = {
	member: Member;
	mode: KansoMode;
};

export type HealthResponse = {
	ok: boolean;
	name: string;
	version: string;
	mode: KansoMode;
};
