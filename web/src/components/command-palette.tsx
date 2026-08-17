// 命令面板（⌘K）：全局搜索任务（标题/描述）+ 页面快捷跳转。
// 对齐原型 shell.jsx CommandPalette：顶部输入 + ESC 提示，任务结果（副标题=项目名），
// 键盘上下+回车导航；空查询展示最近更新任务。
import { useQuery } from "@tanstack/react-query";
import {
	GaugeIcon,
	CalendarDaysIcon,
	HistoryIcon,
	SearchIcon,
	SettingsIcon,
	CheckIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { cn } from "@/lib/cn";

import type { SearchHit } from "@/types/search";

type PageItem = {
	name: string;
	to: string;
	icon: React.ReactNode;
};

const PAGES: PageItem[] = [
	{ name: "仪表盘", to: "/dashboard", icon: <GaugeIcon /> },
	{ name: "日历", to: "/calendar", icon: <CalendarDaysIcon /> },
	{ name: "活动记录", to: "/activity", icon: <HistoryIcon /> },
	{ name: "设置", to: "/settings", icon: <SettingsIcon /> },
];

export function CommandPalette({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [q, setQ] = useState("");
	const [debounced, setDebounced] = useState("");
	const [sel, setSel] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();

	// 输入防抖（250ms），避免每键一次请求。
	useEffect(() => {
		if (!open) return;
		const t = setTimeout(() => setDebounced(q), 250);
		return () => clearTimeout(t);
	}, [q, open]);

	useEffect(() => {
		setSel(0);
	}, [q]);

	useEffect(() => {
		if (open) {
			setQ("");
			setDebounced("");
			setSel(0);
			// 面板展开后再聚焦（否则动画期间焦点被抢）。
			const t = setTimeout(() => inputRef.current?.focus(), 30);
			return () => clearTimeout(t);
		}
	}, [open]);

	const { data: results } = useQuery({
		queryKey: [...queryKeys.tasks(), "search", debounced],
		queryFn: () =>
			api<SearchHit[]>(`${buildPath("search")}?q=${encodeURIComponent(debounced)}`),
		enabled: open,
	});

	// 防抖期间（q !== debounced）不渲染旧结果：否则输入后立即回车会打开
	// 上一轮查询（如空查询的"最近任务"）的命中——真实竞态 bug，E2E 复现。
	const hits = q === debounced ? (results ?? []) : [];

	// 键盘：上下移动、回车打开、ESC 关闭。
	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
			return;
		}
		const total = hits.length + PAGES.length;
		if (total === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSel((v) => (v + 1) % total);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSel((v) => (v - 1 + total) % total);
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (sel < hits.length) {
				openTask(hits[sel]);
			} else {
				const page = PAGES[sel - hits.length];
				if (page) {
					navigate(page.to);
					onClose();
				}
			}
		}
	}

	function openTask(hit: SearchHit) {
		navigate(`/w/${hit.workspaceId}/p/${hit.projectId}/t/${hit.id}`);
		onClose();
	}

	const panelRef = useRef<HTMLDivElement>(null);

	// 焦点陷阱（S-15）：自定义遮罩非 Base UI Dialog，Tab/Shift+Tab 需在面板内循环，
	// 防止焦点逃逸到背景页面（aria-modal 语义要求）。
	function trapFocus(e: React.KeyboardEvent) {
		if (e.key !== "Tab" || !panelRef.current) return;
		const focusables = panelRef.current.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-[110] flex items-start justify-center bg-black/55 px-6 pt-[16vh] backdrop-blur-[2px]"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-label="全局搜索"
		>
			<div ref={panelRef} onKeyDown={trapFocus} className="kanso-command-panel w-full max-w-[600px] overflow-hidden animate-[popIn_160ms_cubic-bezier(0.23,1,0.32,1)]">
				{/* 输入行 */}
				<div className="flex items-center gap-2.5 border-b px-4 py-3.5">
					<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						value={q}
						onChange={(e) => setQ(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder="搜索任务标题、描述…"
						className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
					/>
					<span className="shrink-0 font-mono text-[10.5px] tracking-wide text-muted-foreground/70">
						ESC
					</span>
				</div>

				<div className="max-h-[380px] overflow-y-auto p-2">
					{q !== debounced ? (
						<div className="py-7 text-center text-[13px] text-muted-foreground">
							搜索中…
						</div>
					) : hits.length === 0 && debounced !== "" ? (
						<div className="py-7 text-center text-[13px] text-muted-foreground">
							未找到匹配的任务
						</div>
					) : (
						<>
							{hits.length > 0 ? (
								<>
									<p className="px-2.5 pb-1 pt-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
										任务
									</p>
									{hits.map((t, i) => (
										<button
											key={t.id}
											type="button"
											onMouseEnter={() => setSel(i)}
											onClick={() => openTask(t)}
											className={cn(
												"flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors",
												i === sel
													? "bg-accent text-accent-foreground"
													: "text-foreground",
											)}
										>
											<span
												className={cn(
													"flex size-6 shrink-0 items-center justify-center rounded-md",
													i === sel
														? "bg-accent"
														: "bg-muted text-muted-foreground",
												)}
											>
												<CheckIcon className="size-3" />
											</span>
											<span className="min-w-0 flex-1 truncate">{t.title}</span>
											<span className="shrink-0 text-[11px] text-muted-foreground/70">
												{t.projectName}
											</span>
										</button>
									))}
								</>
							) : null}

							<p className="px-2.5 pb-1 pt-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
								页面
							</p>
							{PAGES.map((p, i) => {
								const idx = hits.length + i;
								return (
									<button
										key={p.name}
										type="button"
										onMouseEnter={() => setSel(idx)}
										onClick={() => {
											navigate(p.to);
											onClose();
										}}
										className={cn(
											"flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors",
											idx === sel
												? "bg-accent text-accent-foreground"
												: "text-foreground",
										)}
									>
										<span
											className={cn(
												"flex size-6 shrink-0 items-center justify-center rounded-md",
												idx === sel
													? "bg-accent"
													: "bg-muted text-muted-foreground",
											)}
										>
											{p.icon}
										</span>
										<span className="flex-1">{p.name}</span>
									</button>
								);
							})}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
