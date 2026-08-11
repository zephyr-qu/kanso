import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { "@": path.resolve(import.meta.dirname, "src") },
	},
	server: {
		port: 5173,
		// 开发时 API 走本地 Go 服务（默认 8080）；ws: true 让 WebSocket 升级也经代理。
		proxy: { "/api": { target: "http://localhost:8080", ws: true } },
	},
	test: {
		// 纯函数单测，node 环境即可（无需 jsdom）。
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
