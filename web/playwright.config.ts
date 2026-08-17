import { defineConfig } from "@playwright/test";
import path from "node:path";

const apiPort = process.env.KANSO_E2E_API_PORT ?? "8080";
const webPort = process.env.KANSO_E2E_WEB_PORT ?? "5173";
const apiURL = `http://127.0.0.1:${apiPort}`;
const webURL = `http://127.0.0.1:${webPort}`;

// Playwright E2E 配置：测试自动启动真实后端（go run .）与前端 dev server。
// 端口可通过 KANSO_E2E_* 环境变量覆盖；未设置 KANSO_ACCESS_KEY 时固定 mock-key
// 与各 spec 的登录回退一致，无需外部 env 块即可运行。
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
			env: {
				KANSO_ADDR: `127.0.0.1:${apiPort}`,
				KANSO_API_URL: apiURL,
				GOCACHE: path.resolve("..", ".gocache-e2e"),
				// W-5：WS 升级 Origin 白名单——浏览器 origin 是 Vite dev server（webURL）。
				KANSO_WS_ORIGINS: webURL,
				// 默认固定测试密钥，避免后端随机生成导致登录 401（specs 回退 mock-key）。
				KANSO_ACCESS_KEY: process.env.KANSO_ACCESS_KEY ?? "mock-key",
			},
		},
		{
			command: `pnpm exec vite --host 127.0.0.1 --port ${webPort}`,
			cwd: ".",
			url: webURL,
			timeout: 120_000,
			reuseExistingServer: false,
			// E2E 永远跑真后端：.env.development 默认 VITE_USE_MOCK=true，必须显式覆盖。
			env: { VITE_USE_MOCK: "false", VITE_API_TARGET: apiURL },
		},
	],
	// 单 worker：多个 worker 并行压 dev server（vite 热更新/资源竞争）会偶发超时（已实测）。
	workers: 1,
	use: {
		baseURL: webURL,
		viewport: { width: 1440, height: 900 },
	},
});
