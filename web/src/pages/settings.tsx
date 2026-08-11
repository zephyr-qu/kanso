// 设置页（借鉴原型 #settings）：访问密钥 / 数据备份 / 关于。
// 访问密钥显示当前登录密钥（localStorage）；备份在 mock 下导出 mock 数据快照，
// 对接后端后由真实备份端点提供。
import { useState } from "react";
import { getAccessKey } from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

function maskKey(key: string): string {
	if (key.length <= 8) return "••••••••";
	return `${key.slice(0, 8)}••••••••`;
}

export default function SettingsPage() {
	const [showKey, setShowKey] = useState(false);
	const [backupState, setBackupState] = useState<"idle" | "loading" | "done">(
		"idle",
	);
	const accessKey = getAccessKey() ?? "";

	async function downloadBackup() {
		setBackupState("loading");
		try {
			const data = await api<Record<string, unknown>>("/api/settings/backup");
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `kanso-backup-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
			setBackupState("done");
		} catch {
			setBackupState("idle");
		}
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
				<h1 className="text-[17px] font-[650] tracking-tight">设置</h1>
			</div>

			<div className="flex-1 overflow-auto px-8 pb-12 pt-7">
				{/* 访问 */}
				<div className="mb-3.5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
					<div className="mb-4 text-[13px] font-semibold text-foreground">
						访问
					</div>
					<div className="flex items-center justify-between gap-4 py-2.5">
						<div>
							<div className="text-sm text-foreground">访问密钥</div>
							<div className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
								前端登录使用的共享密钥；Docker 部署时见{" "}
								<code className="font-mono">docker logs</code>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span className="rounded-[6px] bg-[rgba(24,24,27,0.04)] px-2.5 py-[5px] font-mono text-[13px] text-muted-foreground">
								{showKey && accessKey
									? accessKey
									: maskKey(accessKey || "未设置密钥")}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowKey((v) => !v)}
								disabled={!accessKey}
							>
								{showKey ? "隐藏" : "显示"}
							</Button>
						</div>
					</div>
				</div>

				{/* 数据 */}
				<div className="mb-3.5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
					<div className="mb-4 text-[13px] font-semibold text-foreground">
						数据
					</div>
					<div className="flex items-center justify-between gap-4 py-2.5">
						<div>
							<div className="text-sm text-foreground">数据备份</div>
							<div className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
								数据存储于 SQLite 单文件，备份 =
								复制该文件（服务运行时请先停止或使用备份模式）
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Button
								size="sm"
								onClick={downloadBackup}
								loading={backupState === "loading"}
							>
								{backupState === "done" ? "已导出" : "下载备份"}
							</Button>
						</div>
					</div>
				</div>

				{/* 关于 */}
				<div className="rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
					<div className="mb-4 text-[13px] font-semibold text-foreground">
						关于
					</div>
					<div className="py-1 text-[13px] leading-[2] text-muted-foreground">
						Kanso <b className="font-medium text-foreground">v0.1.0</b> ·
						单二进制部署
						<br />
						技术栈：Go（chi · SQLite · WebSocket）+ React 19 · Tailwind 4
						<br />
						内网自用 · 单机 · 无外部依赖
					</div>
				</div>
			</div>
		</div>
	);
}
