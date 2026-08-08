import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { "@": path.resolve(import.meta.dirname, "src") },
	},
	server: {
		port: 5173,
		// 开发时 API 走本地 Go 服务（默认 8080）
		proxy: { "/api": "http://localhost:8080" },
	},
});
