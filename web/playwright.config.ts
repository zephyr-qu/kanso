import { defineConfig } from "@playwright/test";

const apiPort = process.env.KANSO_E2E_API_PORT ?? "8080";
const webPort = process.env.KANSO_E2E_WEB_PORT ?? "5173";
const apiURL = `http://127.0.0.1:${apiPort}`;
const webURL = `http://127.0.0.1:${webPort}`;
const viteBin = process.platform === "win32" ? "node_modules/.bin/vite.cmd" : "node_modules/.bin/vite";

// Playwright E2E 与原型对比脚本配置。
// 测试会自动启动前端与后端；端口可通过 KANSO_E2E_* 环境变量覆盖。
export default defineConfig({
	testDir: "./e2e",
	timeout: 45_000,
	fullyParallel: false,
	webServer: [
		{
			command: "go run .",
			cwd: "..",
			url: `${apiURL}/api/health`,
			timeout: 120_000,
			reuseExistingServer: false,
		},
		{
			command: `${viteBin} --host 127.0.0.1 --port ${webPort}`,
			cwd: ".",
			url: webURL,
			timeout: 120_000,
			reuseExistingServer: false,
		},
	],
	// 单 worker：多个 worker 并行压 dev server（vite 热更新/资源竞争）会偶发超时（已实测）。
	workers: 1,
	use: {
		baseURL: webURL,
		viewport: { width: 1440, height: 900 },
	},
});
