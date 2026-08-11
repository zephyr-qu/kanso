import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

// 开发模式默认启用 MSW mock（前后端分离阶段，数据来自 src/mocks/seed-data.ts）。
// 关闭：设 VITE_USE_MOCK=false（.env.development 或启动命令）。
// 对接后端：移除下方 enableMocking 调用即可，业务代码零改动。
async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK === "false") return;
	const { worker } = await import("./mocks/browser");
	await worker.start({ onUnhandledRequest: "bypass" });
}

enableMocking().then(() => {
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</StrictMode>,
	);
});
