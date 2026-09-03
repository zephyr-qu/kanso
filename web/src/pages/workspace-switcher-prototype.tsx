import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, GaugeIcon, LayersIcon, Plus, SettingsIcon } from "lucide-react";
import { Link } from "react-router";

const workspaces = [
	{ id: "studio", name: "Kanso 工作室", mark: "K", pinned: ["官网改版"], projects: ["官网改版", "产品发布", "内容计划"] },
	{ id: "personal", name: "个人空间", mark: "私", pinned: ["年度阅读"], projects: ["生活方式", "年度阅读", "旅行计划"] },
	{ id: "client", name: "客户项目", mark: "客", pinned: ["品牌升级"], projects: ["品牌升级", "网站交付"] },
];

export default function WorkspaceSwitcherPrototype() {
	const [activeId, setActiveId] = useState("studio");
	const [menuOpen, setMenuOpen] = useState(true);
	const activeWorkspace = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];

	return (
		<div className="kanso-shell">
			<aside className="kanso-sidebar">
				<div className="kanso-brand">
					<span className="kanso-brand-mark">簡</span>
					<span className="kanso-brand-name">Kanso</span>
					<span className="kanso-brand-mode rounded-full border px-1.5 py-px text-[10px] leading-none text-muted-foreground">团队版</span>
				</div>

				<div className={`kanso-workspace-switcher${menuOpen ? " is-open" : ""}`}>
					<button className="kanso-workspace-switcher-trigger" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
						<span className="kanso-workspace-switcher-icon" aria-hidden="true">{activeWorkspace.mark}</span>
						<span className="kanso-workspace-switcher-copy">
							<span className="kanso-workspace-switcher-label">当前工作区</span>
							<strong>{activeWorkspace.name}</strong>
						</span>
						<ChevronDown className="kanso-workspace-switcher-chevron" />
					</button>
					{menuOpen ? (
						<div className="kanso-workspace-switcher-menu" role="menu" aria-label="切换工作区">
							<div className="kanso-workspace-switcher-menu-label">切换工作区</div>
							{workspaces.map((workspace) => (
								<button className={`kanso-workspace-switcher-option${workspace.id === activeId ? " is-current" : ""}`} type="button" role="menuitem" key={workspace.id} onClick={() => { setActiveId(workspace.id); setMenuOpen(false); }}>
									<span className="kanso-workspace-option-dot" aria-hidden="true">{workspace.mark}</span>
									<span className="kanso-workspace-option-name">{workspace.name}</span>
									{workspace.id === activeId ? <span className="kanso-workspace-option-check"><Check size={14} /></span> : null}
								</button>
							))}
							<div className="kanso-workspace-switcher-divider" />
							<button className="kanso-workspace-switcher-create" type="button"><Plus /> 新建工作区</button>
						</div>
					) : null}
				</div>

				<nav className="kanso-sidebar-nav">
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">总览</p>
						<button className="kanso-sidebar-item is-active" type="button"><GaugeIcon /><span className="kanso-sidebar-label">仪表盘</span></button>
					</section>
					{activeWorkspace.pinned.length > 0 ? (
						<section className="kanso-sidebar-group">
							<p className="kanso-sidebar-group-label">置顶</p>
							{activeWorkspace.pinned.map((project) => <button className="kanso-sidebar-item" type="button" key={project}><LayersIcon /><span className="kanso-sidebar-label">{project}</span></button>)}
						</section>
					) : null}
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">项目</p>
						{activeWorkspace.projects.map((project) => <button className="kanso-sidebar-item" type="button" key={project}><LayersIcon /><span className="kanso-sidebar-label">{project}</span></button>)}
					</section>
					<section className="kanso-sidebar-group">
						<p className="kanso-sidebar-group-label">管理</p>
						<button className="kanso-sidebar-item" type="button"><SettingsIcon /><span className="kanso-sidebar-label">设置</span></button>
					</section>
				</nav>

				<div className="kanso-sidebar-footer">
					<div className="kanso-sidebar-identity"><span className="size-7 rounded-full bg-[#dbc4b1] text-center text-[11px] leading-7 text-[#684d3a]">林</span><span className="kanso-sidebar-identity-label min-w-0 flex-1 truncate">林默</span></div>
				</div>
			</aside>

			<main className="kanso-main">
				<div className="flex h-full flex-col">
					<header className="flex h-[52px] shrink-0 items-center justify-between border-b px-6 text-xs text-muted-foreground">
						<span>工作区原型预览</span>
						<Link className="inline-flex items-center gap-1.5 hover:text-foreground" to="/"><ArrowLeft size={14} /> 返回首页</Link>
					</header>
					<div className="flex-1 overflow-auto px-8 pb-12 pt-8">
						<div className="mx-auto max-w-4xl">
							<p className="mb-2 text-xs text-muted-foreground">{activeWorkspace.name} · 当前工作区</p>
							<h1 className="text-2xl font-semibold tracking-tight">项目总览</h1>
							<p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">这里保留原来 Kanso 的页面结构与视觉，只验证工作区作为完整上下文切换的位置。</p>
							<div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
								{activeWorkspace.projects.map((project, index) => <article className="relative rounded-lg border bg-card p-4 shadow-card" key={project}><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span><h2 className="mt-7 text-sm font-semibold">{project}</h2><p className="mt-1 text-xs text-muted-foreground">{index + 2} 项进行中</p><span className="absolute bottom-4 right-4 text-primary">↗</span></article>)}
			</div>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
