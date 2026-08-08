// 登录页：输入 Access Key 调用 /api/auth/verify，通过后写入 localStorage 并进入应用。
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
		<div className="flex h-dvh items-center justify-center bg-background p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Kanso</CardTitle>
					<CardDescription>输入访问密钥以进入（内网自用，见 KANSO_ACCESS_KEY 或 docker logs）</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="access-key">访问密钥</Label>
							<Input
								id="access-key"
								type="password"
								autoComplete="current-password"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder="粘贴访问密钥"
								autoFocus
							/>
						</div>
						{error ? <p className="text-sm text-destructive">{error}</p> : null}
					</CardContent>
					<CardFooter>
						<Button type="submit" className="w-full" loading={loading} disabled={!key.trim()}>
							进入
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
