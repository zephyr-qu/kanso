// 实时同步 hook：订阅 WebSocket，收到事件后 invalidate 相关查询；断线自动重连。
// projectId 为空时订阅全局事件（工作区级广播，如备份导入），收到任意事件即失效全部查询
// （dashboard/活动/日历等聚合页）；有 projectId 时失效该项目的看板范围。
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessKey } from "@/lib/api";
import { invalidateRealtimeEvent } from "@/hooks/query-keys";

// 真实后端模式订阅 WebSocket；Mock 模式由 MSW 提供 REST 数据，不建立连接。
// project 参数后端仅作订阅桶（非空即可）：全局订阅用固定哨兵值，仍会收到 BroadcastAll。
export function useRealtime(
	projectId: string | undefined,
	options: { deferInvalidation?: boolean } = {},
) {
	const queryClient = useQueryClient();
	const deferInvalidation = options.deferInvalidation ?? false;
	const deferredRef = useRef(false);
	const deferRef = useRef(deferInvalidation);
	deferRef.current = deferInvalidation;

	useEffect(() => {
		if (import.meta.env.VITE_USE_MOCK !== "false") return;
		const key = getAccessKey();
		if (!key) return;

		let ws: WebSocket | null = null;
		let closed = false;
		let retry: ReturnType<typeof setTimeout> | null = null;

		const invalidate = (eventType = "unknown") => {
			if (deferRef.current) {
				deferredRef.current = true;
				return;
			}
			invalidateRealtimeEvent(queryClient, projectId, eventType);
		};

		const connect = () => {
			if (closed) return;
			const scheme = location.protocol === "https:" ? "wss" : "ws";
			const project = projectId ?? "__all__";
			const url = `${scheme}://${location.host}/api/ws?project=${encodeURIComponent(project)}&key=${encodeURIComponent(key)}`;
			ws = new WebSocket(url);

			ws.onopen = () => {
				// 每次（重）连接成功即拉取最新数据（spec：断线重连后重新拉取）。
				invalidate();
			};
			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(String(event.data)) as { type?: string };
					if (msg.type) invalidate(msg.type);
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

	useEffect(() => {
		if (!deferInvalidation && deferredRef.current && projectId) {
			deferredRef.current = false;
			invalidateRealtimeEvent(queryClient, projectId, "deferred");
		}
	}, [deferInvalidation, projectId, queryClient]);
}
