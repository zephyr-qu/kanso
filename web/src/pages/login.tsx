// 登录页（借鉴原型 #login）：品牌侧（主色 mark + 标语）+ 表单侧（密钥入口）。
// 保留现有功能：校验密钥、错误提示、loading、401 重定向。
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { setAccessKey, verifyAccessKey } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { PrimaryButton } from "@/components/kanso-ui";


export default function LoginPage() {
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const login = useAuthStore((s) => s.login);
	// RequireAuth 重定向到登录页时携带 state.from，登录成功后回跳原页面。
	const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
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
				navigate(redirectTo, { replace: true });
			} else {
				setError("访问密钥不正确，请重试");
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div data-kanso-login className="flex min-h-dvh bg-background text-foreground">
			{/* 左：品牌侧 */}
			{/* 对齐原型 #login .brand-side：padding 48px 56px。 */}
			<div className="flex flex-1 flex-col justify-between gap-8 p-12 md:px-14 md:py-12">
				<div className="flex items-center gap-3 animate-[fadeIn_400ms_ease_both]">
					<span
					className="kanso-login-mark"
					aria-hidden
					>
						簡
					</span>
					<span className="text-[17px] font-bold tracking-[-0.01em]">Kanso</span>
				</div>

				{/* 中部：标语（上，左对齐）→ 插画（下，居中） */}
				<div className="flex w-full flex-col items-center gap-8">
					<div className="hidden w-full max-w-[440px] md:block">
						<p className="text-4xl font-semibold leading-[1.3] tracking-tight animate-[fadeInUp_500ms_100ms_ease_both] md:text-[44px]">
							简单，专注。
						</p>
						<p
							className="mt-4 text-[15px] leading-relaxed text-muted-foreground animate-[fadeInUp_500ms_200ms_ease_both]"
							style={{ animationDelay: "200ms" }}
						>
							内网看板 · 自用轻量 · 现代简约
						</p>
					</div>
					<img
						src="/illustrations/organizing-projects.svg"
						alt="看板工作台插画"
						className="w-full max-w-[440px] animate-[fadeInUp_600ms_250ms_ease_both]"
						draggable={false}
					/>
				</div>

				<p className="text-xs text-muted-foreground/70">Kanban · 单机部署</p>
			</div>

			{/* 右：密钥入口 */}
			<div className="flex w-full items-center justify-center border-l border-border bg-card px-8 py-16 md:w-[420px] md:px-12">
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
						<PrimaryButton
							type="submit"
							className="h-[38px] w-full"
							loading={loading}
							disabled={!key.trim()}
						>
							进入
						</PrimaryButton>
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
