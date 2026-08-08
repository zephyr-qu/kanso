// 实时同步 hook：订阅项目的 WebSocket，收到事件后 invalidate 相关查询；断线自动重连。
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessKey } from "@/lib/api";
import { invalidateBoardScope } from "@/hooks/query-keys";

export function useRealtime(projectId: string | undefined) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!projectId) return;
		const key = getAccessKey();
		if (!key) return;

		let ws: WebSocket | null = null;
		let closed = false;
		let retry: ReturnType<typeof setTimeout> | null = null;

		const invalidate = () => {
			// 项目事件可能影响看板与任一任务详情，统一失效（失效映射见 query-keys.ts）。
			invalidateBoardScope(queryClient, projectId);
		};

		const connect = () => {
			if (closed) return;
			const scheme = location.protocol === "https:" ? "wss" : "ws";
			const url = `${scheme}://${location.host}/api/ws?project=${encodeURIComponent(projectId)}&key=${encodeURIComponent(key)}`;
			ws = new WebSocket(url);

			ws.onopen = () => {
				// 每次（重）连接成功即拉取最新数据（spec：断线重连后重新拉取）。
				invalidate();
			};
			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(String(event.data)) as { type?: string };
					if (msg.type) invalidate();
				} catch {
					// 忽略无法解析的消息
				}
			};
			ws.onclose = () => {
				if (!closed) retry = setTimeout(connect, 2000);
			};
			ws.onerror = () => ws?.close();
		};

		connect();
		return () => {
			closed = true;
			if (retry) clearTimeout(retry);
			ws?.close();
		};
	}, [projectId, queryClient]);
}
