import { defineConfig } from "@playwright/test";

// Playwright E2E 与原型对比脚本配置。
// 前置：前端 dev server (5173) 与后端 (8080) 需在运行。
// 登录后页面需要 KANSO_ACCESS_KEY 环境变量（当前后端随机生成的密钥）。
export default defineConfig({
	testDir: "./e2e",
	timeout: 45_000,
	fullyParallel: false,
	// 单 worker：多个 worker 并行压 dev server（vite 热更新/资源竞争）会偶发超时（已实测）。
	workers: 1,
	use: {
		baseURL: "http://localhost:5173",
		viewport: { width: 1440, height: 900 },
	},
});
