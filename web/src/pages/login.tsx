// 登录页：品牌时刻——朱印 + 明朝字标 + 和紙底，不对称构图。
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAccessKey, verifyAccessKey } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const login = useAuthStore((s) => s.login);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = key.trim();
		if (!trimmed || loading) return;
		setLoading(true);
		setError(null);
		try {
			const ok = await verifyAccessKey(trimmed);
			if (ok) {
				setAccessKey(trimmed);
				login();
				navigate("/", { replace: true });
			} else {
				setError("访问密钥不正确，请重试");
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex h-dvh flex-col justify-between overflow-hidden md:flex-row">
			{/* 左：品牌块——朱印盖下、字标、一句注脚 */}
			<div className="relative flex flex-1 flex-col justify-between p-8 md:p-14">
				<div className="flex items-center gap-4 animate-[fadeIn_500ms_ease_both]">
					<span className="seal seal-lg animate-[stamp_500ms_cubic-bezier(0.23,1,0.32,1)_both]">
						簡
					</span>
					<span className="wordmark">Kanso</span>
				</div>
				<div className="hidden md:block">
					<p
						className="font-display text-4xl leading-snug tracking-wide animate-[fadeInUp_700ms_150ms_ease_both]"
						style={{ animationDelay: "150ms" }}
					>
						簡素。
					</p>
					<p
						className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground animate-[fadeInUp_700ms_300ms_ease_both]"
						style={{ animationDelay: "300ms" }}
					>
						内网看板，自用轻量。去除芜杂，只留事务本身。
					</p>
				</div>
				<div className="hairline-b pb-3">
					<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground/70">
						Kanban · 内网 · 单机
					</p>
				</div>
			</div>

			{/* 右：密钥入口 */}
			<div className="flex items-center justify-center border-l px-8 py-16 md:w-[26rem] md:px-12">
				<div className="w-full max-w-sm animate-[fadeInUp_600ms_200ms_ease_both]">
					<p className="font-display text-2xl">进入</p>
					<p className="mt-1 text-sm text-muted-foreground">
						输入访问密钥（见{" "}
						<code className="font-mono text-xs">KANSO_ACCESS_KEY</code> 或
						<code className="font-mono text-xs"> docker logs</code>）
					</p>
					<form onSubmit={handleSubmit} className="mt-8 space-y-4">
						<div>
							<label
								htmlFor="access-key"
								className="mb-1.5 block text-xs text-muted-foreground"
							>
								访问密钥
							</label>
							<Input
								id="access-key"
								type="password"
								autoComplete="current-password"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder="粘贴访问密钥"
								autoFocus
								className="h-10 rounded-[3px]"
							/>
						</div>
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
						<Button
							type="submit"
							className="w-full rounded-[3px]"
							loading={loading}
							disabled={!key.trim()}
						>
							进入
						</Button>
					</form>
				</div>
			</div>

			{/* 入场动画 */}
			<style>{`
				@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
				@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
				@keyframes stamp {
					0% { opacity: 0; transform: scale(1.6) rotate(-14deg) }
					55% { opacity: 1; transform: scale(0.92) rotate(2deg) }
					100% { opacity: 1; transform: scale(1) rotate(0deg) }
				}
			`}</style>
		</div>
	);
}
