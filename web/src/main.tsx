import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
	MutationCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./styles/index.scss";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { toastManager, ToastProvider } from "@/components/ui/toast";
import { initTheme } from "@/lib/theme";

// mutation 失败全局 toast：api() 已把服务端 `{error}` 正文附加到消息（" — " 之后），直接透出。
// 401 例外——本地密钥已清除并由路由守卫引导回登录页，无需额外打扰。
const queryClient = new QueryClient({
	mutationCache: new MutationCache({
		onError: (error) => {
			const raw = error instanceof Error ? error.message : "";
			if (raw.includes("401")) return;
			const idx = raw.indexOf(" — ");
			const description =
				idx >= 0
					? raw.slice(idx + 3)
					: raw.includes("Failed to fetch") || raw.includes("NetworkError")
						? "网络连接失败，请检查网络后重试"
						: raw || "请稍后重试";
			toastManager.add({ title: "操作失败", description, type: "error" });
		},
	}),
});

async function bootstrap(): Promise<void> {
	initTheme(); // 首屏渲染前应用主题偏好（html.dark），避免闪白。
	if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK !== "false") {
		const { startMockWorker } = await import("@/mocks/browser");
		await startMockWorker();
	}
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<ToastProvider>
					<ErrorBoundary>
						<App />
					</ErrorBoundary>
				</ToastProvider>
			</QueryClientProvider>
		</StrictMode>,
	);
}

void bootstrap();
