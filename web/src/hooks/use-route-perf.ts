// 开发环境路由耗时测量（dev-only）：记录「点击内部链接 → 下一帧」的耗时，
// 输出 [kanso] route <from> -> <to>: <ms>，便于在控制台和 Performance 面板定位卡顿来源。
// 生产构建零行为（两个 effect 均有 import.meta.env.DEV 守卫）。
import { useEffect, useRef } from "react";

export function useRoutePerf(pathname: string): void {
	const routeIntentRef = useRef<{
		id: number;
		from: string;
		startMark: string;
	} | null>(null);
	const routeMeasureIdRef = useRef(0);

	// 点击内部链接时打起始标记，记住测量意图。
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest<HTMLAnchorElement>("a[href]");
			if (!link || link.target === "_blank" || event.defaultPrevented) return;
			const url = new URL(link.href, window.location.href);
			if (url.origin !== window.location.origin || url.pathname === pathname)
				return;

			const id = ++routeMeasureIdRef.current;
			const startMark = `kanso-route-start-${id}`;
			performance.mark(startMark);
			routeIntentRef.current = {
				id,
				from: pathname,
				startMark,
			};
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, [pathname]);

	// 路由变化后在下一帧结束测量；无点击意图（键盘/程序跳转）时也补一个测量。
	const previousPathRef = useRef(pathname);
	useEffect(() => {
		if (!import.meta.env.DEV) {
			previousPathRef.current = pathname;
			return;
		}
		const from = previousPathRef.current;
		const to = pathname;
		previousPathRef.current = to;
		if (from === to) return;

		const pending =
			routeIntentRef.current?.from === from ? routeIntentRef.current : null;
		const id = pending?.id ?? ++routeMeasureIdRef.current;
		const startMark = pending?.startMark ?? `kanso-route-start-${id}`;
		if (!pending) performance.mark(startMark);
		const endMark = `kanso-route-paint-${id}`;
		const measureName = `kanso-route-${id}`;
		const frameId = window.requestAnimationFrame(() => {
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			const [measure] = performance.getEntriesByName(measureName);
			console.debug(
				`[kanso] route ${from} -> ${to}: ${Math.round(measure?.duration ?? 0)}ms`,
			);
			if (routeIntentRef.current?.id === id) routeIntentRef.current = null;
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [pathname]);
}
