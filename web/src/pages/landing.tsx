import { useState } from "react";
import { Link } from "react-router";
import {
	ArrowUpRight,
	Check,
	Circle,
	Command,
	Layers3,
	Menu,
	PenLine,
	Plus,
	Search,
	ShieldCheck,
	Sparkles,
	X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";

const boardColumns = [
	{
		name: "待处理",
		count: 3,
		color: "orange",
		cards: ["整理用户反馈", "确定 Q3 目标", "准备周会材料"],
	},
	{
		name: "进行中",
		count: 2,
		color: "blue",
		cards: ["重构登录流程", "发布产品更新"],
	},
	{
		name: "已完成",
		count: 4,
		color: "green",
		cards: ["设计新图标", "清理旧分支", "更新 README"],
	},
];

const featureCards = [
	{
		index: "01",
		title: "看得见的进度",
		text: "一块清爽的看板，把杂乱的待办变成下一步自然浮现的路径。",
		icon: Layers3,
		accent: "orange",
	},
	{
		index: "02",
		title: "少一点打扰",
		text: "轻量、克制、不追着你发送通知。专注的时候，界面也保持安静。",
		icon: Sparkles,
		accent: "blue",
	},
	{
		index: "03",
		title: "只在你的空间里",
		text: "单机部署，数据掌握在自己手里。适合小团队，也适合一个人的长期项目。",
		icon: ShieldCheck,
		accent: "green",
	},
];

function ProductMark() {
	return (
		<span className="landing-mark" aria-hidden="true">
			簡
		</span>
	);
}

function BoardPreview() {
	return (
		<div className="landing-preview-wrap" aria-label="Kanso 看板工作台预览">
			<div className="landing-preview-note landing-preview-note-top">WORK QUIETLY</div>
			<div className="landing-preview-note landing-preview-note-bottom">KANSO / 01</div>
			<div className="landing-board-preview">
				<div className="landing-board-topbar">
					<div className="landing-board-brand">
						<ProductMark />
						<span>Kanso</span>
					</div>
					<div className="landing-board-top-actions">
						<span className="landing-board-search"><Search size={12} /> 搜索</span>
						<span className="landing-board-avatar">林</span>
					</div>
				</div>
				<div className="landing-board-body">
					<aside className="landing-board-sidebar">
						<div className="landing-board-workspace">
							<span className="landing-workspace-dot" />
							<span>个人工作区</span>
						</div>
						<div className="landing-board-nav-item active"><Command size={12} /> 我的项目</div>
						<div className="landing-board-nav-item"><Circle size={12} /> 收集箱</div>
						<div className="landing-board-nav-item"><Check size={12} /> 已完成</div>
						<div className="landing-board-sidebar-line" />
						<div className="landing-board-sidebar-label">项目</div>
						<div className="landing-board-project"><span className="project-dot orange" /> Kanso 官网</div>
						<div className="landing-board-project"><span className="project-dot blue" /> 生活方式</div>
					</aside>
					<main className="landing-board-main">
						<div className="landing-board-heading">
							<div>
								<span className="landing-board-kicker">PROJECT / 02</span>
								<h3>产品发布计划</h3>
							</div>
							<button className="landing-board-add" type="button" aria-label="添加任务"><Plus size={14} /></button>
						</div>
						<div className="landing-board-columns">
							{boardColumns.map((column) => (
								<div className="landing-board-column" key={column.name}>
									<div className="landing-column-title">
										<span><i className={`column-dot ${column.color}`} />{column.name}</span>
										<small>{column.count}</small>
									</div>
									<div className="landing-column-cards">
										{column.cards.map((card, index) => (
											<div className={`landing-task-card ${index === 0 && column.color === "orange" ? "featured" : ""}`} key={card}>
												{index === 0 && column.color === "orange" ? <PenLine size={12} /> : <span className="task-checkbox" />}
												<span>{card}</span>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</main>
				</div>
			</div>
		</div>
	);
}

export default function LandingPage() {
	const [menuOpen, setMenuOpen] = useState(false);
	const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
	const workspaceHref = isAuthenticated ? "/app" : "/login";

	function closeMenu() {
		setMenuOpen(false);
	}

	return (
		<div className="landing-page">
			<div className="landing-grain" aria-hidden="true" />
			<header className="landing-header">
				<Link className="landing-logo" to="/" aria-label="Kanso 首页">
					<ProductMark />
					<span>Kanso</span>
				</Link>
				<nav className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="主导航">
					<a href="#method" onClick={closeMenu}>为什么 Kanso</a>
					<a href="#features" onClick={closeMenu}>工作方式</a>
					<a href="#about" onClick={closeMenu}>关于产品</a>
					<Link className="landing-nav-mobile-cta" to={workspaceHref} onClick={closeMenu}>
						{isAuthenticated ? "打开工作区" : "进入工作区"}<ArrowUpRight size={14} />
					</Link>
				</nav>
				<Link className="landing-header-cta" to={workspaceHref}>
					{isAuthenticated ? "打开工作区" : "进入工作区"}<ArrowUpRight size={14} />
				</Link>
				<button className="landing-menu-button" type="button" aria-label={menuOpen ? "关闭菜单" : "打开菜单"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
					{menuOpen ? <X size={20} /> : <Menu size={20} />}
				</button>
			</header>

			<main>
				<section className="landing-hero">
					<div className="landing-hero-copy">
						<div className="landing-eyebrow"><span className="landing-eyebrow-line" /> 私有化的轻量工作台 <span className="landing-eyebrow-number">01 / 04</span></div>
						<h1>把事情，放回<br /><em>它该在的位置。</em></h1>
						<p className="landing-hero-lede">Kanso 是一个安静、清晰的任务管理空间。把脑中的杂音摊开、排好，然后只专注于眼前的一件事。</p>
						<div className="landing-hero-actions">
							<Link className="landing-button landing-button-primary" to={workspaceHref}>
								{isAuthenticated ? "继续工作" : "开始使用"}<ArrowUpRight size={16} />
							</Link>
							<a className="landing-button landing-button-quiet" href="#preview">看一眼工作台 <span>↓</span></a>
						</div>
						<div className="landing-proof-row">
							<div className="landing-proof-avatars"><span>R</span><span>Y</span><span>L</span><span>+</span></div>
							<p>已经有 <strong>1,284</strong> 个小项目<br />选择了更安静的工作方式</p>
						</div>
					</div>
					<BoardPreview />
				</section>

				<section className="landing-manifesto" id="method">
					<div className="landing-section-label"><span>02</span> 让工具退后一步</div>
					<div className="landing-manifesto-content">
						<h2>好的工作台，<br /><span>不会和你抢注意力。</span></h2>
						<div className="landing-manifesto-aside">
							<p>Kanso 不试图管理你。它只负责把事情放在眼前，让每个项目都有一个开始、一个进行中，以及一个可以被好好收尾的地方。</p>
							<a href="#features" className="landing-text-link">看看它如何工作 <ArrowUpRight size={14} /></a>
						</div>
					</div>
				</section>

				<section className="landing-feature-section" id="features">
					<div className="landing-section-intro">
						<div className="landing-section-label"><span>03</span> 一条自然的工作流</div>
						<p>从捕捉念头，到交付结果。<br />每一步都刚刚好。</p>
					</div>
					<div className="landing-feature-grid">
						{featureCards.map((feature) => {
							const Icon = feature.icon;
							return (
								<article className="landing-feature-card" key={feature.index}>
									<div className="landing-feature-card-top"><span>{feature.index}</span><Icon size={18} /></div>
									<div className={`landing-feature-icon ${feature.accent}`}><Icon size={20} strokeWidth={1.5} /></div>
									<h3>{feature.title}</h3>
									<p>{feature.text}</p>
									<div className="landing-feature-arrow"><ArrowUpRight size={16} /></div>
								</article>
							);
						})}
					</div>
				</section>

				<section className="landing-quiet-section" id="preview">
					<div className="landing-quiet-copy">
						<div className="landing-section-label"><span>04</span> 给混乱一个容器</div>
						<h2>从“我得记住”<br />到“我知道下一步”。</h2>
						<p>看板、任务、里程碑和团队活动，被收进一个不会打扰你的地方。需要的时候，它总在这里。</p>
						<ul className="landing-check-list">
							<li><Check size={15} /> 看板和列表，自由切换</li>
							<li><Check size={15} /> 任务详情里保留上下文</li>
							<li><Check size={15} /> 为自己或小团队部署</li>
						</ul>
					</div>
					<div className="landing-orbit-art" aria-hidden="true">
						<div className="landing-orbit orbit-one" />
						<div className="landing-orbit orbit-two" />
						<div className="landing-orbit orbit-three" />
						<div className="landing-orbit-center"><ProductMark /></div>
						<span className="landing-orbit-label label-one">想法</span>
						<span className="landing-orbit-label label-two">行动</span>
						<span className="landing-orbit-label label-three">完成</span>
					</div>
				</section>

				<section className="landing-cta-section" id="about">
					<div className="landing-cta-stamp">K / 2026</div>
					<h2>今天，就从一件事开始。</h2>
					<p>你的工作空间已经准备好了。</p>
					<Link className="landing-button landing-button-primary" to={workspaceHref}>{isAuthenticated ? "打开我的工作区" : "进入 Kanso"}<ArrowUpRight size={16} /></Link>
				</section>
			</main>

			<footer className="landing-footer">
				<div className="landing-footer-brand"><ProductMark /><span>Kanso</span><small>简单，专注。</small></div>
				<div className="landing-footer-meta"><span>内网看板 · 自用轻量 · 现代简约</span><span>© 2026 Kanso</span></div>
			</footer>
		</div>
	);
}
