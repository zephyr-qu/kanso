// 设置页：外观（主题）/ 服务配置（可编辑并保存，重启生效 + 密钥热生效）/ 数据（导出备份）/ 关于（版本）。
import { useEffect, useRef, useState } from "react";
import { DownloadIcon, EyeIcon, EyeOffIcon, FileUpIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { PageContent, PageHeader, SurfaceCard } from "@/components/kanso-ui";
import {
	UNAUTHORIZED_EVENT,
	api,
	clearAccessKey,
	getAccessKey,
	setAccessKey,
} from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { THEMES, getTheme, setTheme, type Theme } from "@/lib/theme";

type SettingsConfig = {
	addr: string;
	dataDir: string;
	accessKey: string;
	mode: string;
	wsOrigins: string;
	configFile: string;
};

// 运行模式：personal（默认，单用户）/ team（多成员，ADR-0013）。
// 仅由后端 KANSO_MODE 环境变量在启动时决定，此处只读展示。

export default function SettingsPage() {
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [backingUp, setBackingUp] = useState(false);
	const [importing, setImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [addr, setAddr] = useState("");
	const [dataDir, setDataDir] = useState("");
	const [accessKey, setAccessKeyValue] = useState("");
	const [mode, setMode] = useState("personal");
	const [wsOrigins, setWsOrigins] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [configFile, setConfigFile] = useState("kanso-config.json");
	const [theme, setThemeValue] = useState<Theme>(getTheme());
	const [version, setVersion] = useState("");

	useEffect(() => {
		api<SettingsConfig>(buildPath("settingsConfig"))
			.then((cfg) => {
				setAddr(cfg.addr);
				setDataDir(cfg.dataDir);
				setAccessKeyValue(cfg.accessKey);
				setMode(cfg.mode || "personal");
				setWsOrigins(cfg.wsOrigins ?? "");
				setConfigFile(cfg.configFile);
			})
			.catch(() =>
				toastManager.add({
					title: "读取配置失败",
					description: "无法读取服务端配置，请确认服务运行后重试。",
					type: "error",
				}),
			)
			.finally(() => setLoading(false));

		// 版本信息：健康检查无需认证。
		fetch(buildPath("health"))
			.then((r) => (r.ok ? r.json() : null))
			.then((h: { version?: string } | null) => {
				if (h?.version) setVersion(h.version);
			})
			.catch(() => {});
	}, []);

	const save = async () => {
		setSaving(true);
		try {
			const res = await api<{
				ok: boolean;
				accessKeyApplied: boolean;
				configFile: string;
			}>(buildPath("settingsConfig"), {
				method: "PUT",
				body: JSON.stringify({ addr, dataDir, accessKey, wsOrigins }),
			});
			if (res.accessKeyApplied) {
				// 密钥已热生效：同步本地密钥，避免当前会话下次请求即 401。
				if (accessKey) setAccessKey(accessKey);
				toastManager.add({
					title: "已保存",
					description: `访问密钥已更新并立即生效（${res.configFile}）。`,
					type: "success",
				});
			} else {
				toastManager.add({
					title: "已保存",
					description: `已写入 ${res.configFile}；监听地址、数据目录与 WS 白名单将在重启服务后生效（运行模式由 KANSO_MODE 启动时决定）。`,
					type: "success",
				});
			}
		} catch (error) {
			toastManager.add({
				title: "保存失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
		} finally {
			setSaving(false);
		}
	};

	const exportBackup = async () => {
		setBackingUp(true);
		try {
			const key = getAccessKey();
			const res = await fetch(buildPath("settingsBackup"), {
				headers: key ? { Authorization: `Bearer ${key}` } : {},
			});
			if (!res.ok) {
				if (res.status === 401) {
					clearAccessKey();
					window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
				}
				throw new Error(`导出备份失败（HTTP ${res.status}）`);
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `kanso-backup-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toastManager.add({ title: "备份已导出", type: "success" });
		} catch (error) {
			toastManager.add({
				title: "导出失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
		} finally {
			setBackingUp(false);
		}
	};

	const importBackup = async (file: File) => {
		// 全量替换恢复：覆盖当前全部数据，需二次确认。
		if (!window.confirm("导入备份将覆盖当前全部数据（恢复为快照状态），确定继续？")) return;
		setImporting(true);
		try {
			// 原始文本即 JSON body：非法 JSON 由服务端 400 拒绝（鉴权/401 由 api 层统一处理）。
			await api<{ ok: boolean }>(buildPath("settingsBackup"), {
				method: "POST",
				body: await file.text(),
			});
			// 导入是全量替换：刷新以清空所有查询缓存（其他已开窗口由 backup.imported 广播触发失效）。
			window.location.reload();
		} catch (error) {
			toastManager.add({
				title: "导入失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
		} finally {
			setImporting(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<PageHeader>
				<h1 className="text-[17px] font-[650] tracking-tight">设置</h1>
				<span className="text-[13px] text-muted-foreground">
					外观 · 服务配置 · 数据 · 关于
				</span>
			</PageHeader>

			<PageContent className="px-[30px] pb-11 pt-[26px]">
				{/* 外观：主题（纯前端偏好，localStorage） */}
				<SurfaceCard className="kanso-settings-card p-5">
					<div className="text-sm font-semibold">外观</div>
					<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
						界面明暗主题
					</div>
					<div className="flex gap-1.5">
						{THEMES.map((t) => (
							<Button
								key={t.id}
								size="sm"
								variant={theme === t.id ? "default" : "outline"}
								onClick={() => {
									setThemeValue(t.id);
									setTheme(t.id);
								}}
							>
								{t.label}
							</Button>
						))}
					</div>
				</SurfaceCard>

				{/* 服务配置：服务端运行参数（保存到配置文件，重启生效；密钥热生效） */}
				<SurfaceCard className="kanso-settings-card mt-3.5 p-5">
					<div className="text-sm font-semibold">服务配置</div>
					<div className="mb-3 mt-1 text-xs text-muted-foreground/70">
						保存到 {configFile}；环境变量优先于配置文件
					</div>
					<div className="grid gap-x-6 sm:grid-cols-2">
						{/* 左栏：核心运行参数 */}
						<div className="min-w-0">
							<SettingField
						label="监听地址"
						description="KANSO_ADDR · 默认值 :8080"
						value={addr}
						onChange={setAddr}
					/>
					<SettingField
						label="数据目录"
						description="KANSO_DATA_DIR · 默认值 ./data"
						value={dataDir}
						onChange={setDataDir}
					/>
					<div className="setting-field">
						<div className="text-sm font-semibold">访问密钥</div>
						<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
							KANSO_ACCESS_KEY · 留空表示未设置（下次启动随机生成）
						</div>
						<div className="flex max-w-[640px] items-center gap-2">
							<Input
								type={showKey ? "text" : "password"}
								value={accessKey}
								onChange={(e) => setAccessKeyValue(e.target.value)}
								placeholder="••••••••••••••••"
								className="h-10 flex-1 font-mono"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="shrink-0"
								onClick={() => setShowKey((v) => !v)}
								aria-label={showKey ? "隐藏密钥" : "显示密钥"}
							>
								{showKey ? (
									<EyeOffIcon className="size-4" />
								) : (
									<EyeIcon className="size-4" />
								)}
							</Button>
						</div>
					</div>
						</div>
						{/* 右栏：模式与访问控制 */}
						<div className="min-w-0">
							<div className="setting-field">
						<div className="text-sm font-semibold">运行模式</div>
						<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
							KANSO_MODE · 个人模式（默认）/ 团队模式（多成员）
						</div>
						<div className="flex items-center">
							<span className="rounded-md border border-kanso-primary/30 bg-kanso-primary/10 px-2.5 py-1 text-[13px] font-medium text-kanso-primary">
								{mode === "team" ? "团队模式" : "个人模式"}
							</span>
						</div>
					</div>
					<div className="setting-field">
						<div className="text-sm font-semibold">WebSocket 白名单</div>
						<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
							KANSO_WS_ORIGINS · 逗号分隔，留空仅放行同源
						</div>
						<Input
							value={wsOrigins}
							onChange={(e) => setWsOrigins(e.target.value)}
							placeholder="https://app.example.com, http://localhost:5173"
							className="h-10 max-w-[640px] font-mono"
						/>
						</div>
						</div>
					</div>

					<div className="mt-4 flex items-center gap-3">
						<Button onClick={save} loading={saving}>
							<SaveIcon className="size-4" />
							保存配置
						</Button>
					</div>
					<p className="mt-3 text-xs text-muted-foreground/70">
						监听地址、数据目录与 WS
						白名单为启动参数，重启服务后生效；运行模式由 KANSO_MODE 启动时决定；访问密钥修改后立即生效（旧密钥将失效）。
					</p>
				</SurfaceCard>

				{/* 数据：导出备份 */}
				<SurfaceCard className="kanso-settings-card mt-3.5 p-5">
					<div className="text-sm font-semibold">数据</div>
					<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
						导出全量数据快照（JSON），用于备份与迁移。
					</div>
					<Button variant="outline" onClick={exportBackup} loading={backingUp}>
						<DownloadIcon className="size-4" />
						导出备份
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept="application/json,.json"
						className="hidden"
						onChange={(e) => {
							const f = e.currentTarget.files?.[0];
							if (f) importBackup(f);
						}}
					/>
					<Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={importing}>
						<FileUpIcon className="size-4" />
						导入备份
					</Button>
				</SurfaceCard>

				{/* 关于 */}
				<SurfaceCard className="kanso-settings-card mt-3.5 p-5">
					<div className="text-sm font-semibold">关于</div>
					<div className="mt-1 text-xs text-muted-foreground/70">
						Kanso {version || "…"}
					</div>
				</SurfaceCard>
			</PageContent>
		</div>
	);
}

function SettingField({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="setting-field">
			<div className="text-sm font-semibold">{label}</div>
			<div className="mb-2 mt-1 text-xs text-muted-foreground/70">
				{description}
			</div>
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-10 max-w-[640px] font-mono"
			/>
		</div>
	);
}
