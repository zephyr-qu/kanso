// 登录页（借鉴原型 #login）：品牌侧（主色 mark + 标语）+ 表单侧（密钥入口）。
// 保留现有功能：校验密钥、错误提示、loading、401 重定向。
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
		<div className="flex min-h-dvh">
			{/* 左：品牌侧 */}
			{/* 对齐原型 #login .brand-side：padding 48px 56px。 */}
			<div className="flex flex-1 flex-col justify-between p-12 md:px-14 md:py-12">
				<div className="flex items-center gap-3 animate-[fadeIn_400ms_ease_both]">
					<span
						className="size-[26px] rounded-[7px] bg-primary shadow-[0_1px_4px_rgba(37,99,235,0.4)]"
						aria-hidden
					/>
					<span className="text-[17px] font-bold tracking-[-0.01em]">Kanso</span>
				</div>

				<div className="hidden md:block">
					<p className="text-[26px] font-semibold leading-[1.45] tracking-tight animate-[fadeInUp_500ms_100ms_ease_both]">
						简单，专注。
					</p>
					<p
						className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground animate-[fadeInUp_500ms_200ms_ease_both]"
						style={{ animationDelay: "200ms" }}
					>
						内网看板 · 自用轻量 · 现代简约
					</p>
				</div>

				<p className="text-xs text-muted-foreground/70">Kanban · 单机部署</p>
			</div>

			{/* 右：密钥入口 */}
			<div className="flex w-full items-center justify-center border-l px-8 py-16 md:w-[420px] md:px-12">
				<div className="w-full max-w-[320px] animate-[fadeInUp_450ms_150ms_ease_both]">
					<h1 className="text-xl font-semibold tracking-tight">进入工作区</h1>
					<p className="mt-1 text-[13px] text-muted-foreground">
						输入访问密钥（见{" "}
						<code className="font-mono text-xs">KANSO_ACCESS_KEY</code> 或
						<code className="font-mono text-xs"> docker logs</code>）
					</p>
					<form onSubmit={handleSubmit} className="mt-8 space-y-5">
						<div>
							<label
								htmlFor="access-key"
								className="mb-2 mt-6 block text-[13px] text-muted-foreground"
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
								className="h-[38px]"
							/>
						</div>
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
						<Button
							type="submit"
							className="h-[38px] w-full"
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
			`}</style>
		</div>
	);
}
