import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type MilestoneLinkState = {
	fromX: number;
	fromY: number;
	curX: number;
	curY: number;
	milestoneId: string;
	targetTaskId: string | null;
};

/**
 * 里程碑卡长按拖线关联任务的交互模块。
 * 页面只需要提供关联命令，指针监听、选择抑制和清理都由这里维护。
 */
export function useMilestoneLink(onAttach: (taskId: string, milestoneId: string) => void) {
	const [milestoneLink, setMilestoneLink] = useState<MilestoneLinkState | null>(null);
	const linkPressRef = useRef<{ timer: number } | null>(null);
	const suppressClickRef = useRef(false);
	const attachRef = useRef(onAttach);
	attachRef.current = onAttach;

	const clearLinkPress = useCallback(() => {
		if (linkPressRef.current) {
			window.clearTimeout(linkPressRef.current.timer);
			linkPressRef.current = null;
		}
	}, []);

	const startMilestoneLink = useCallback((event: ReactPointerEvent, milestoneId: string) => {
		clearLinkPress();
		const { clientX: x, clientY: y } = event;
		const timer = window.setTimeout(() => {
			suppressClickRef.current = true;
			document.body.classList.add("no-select");
			setMilestoneLink({ fromX: x, fromY: y, curX: x, curY: y, milestoneId, targetTaskId: null });
		}, 300);
		linkPressRef.current = { timer };
	}, [clearLinkPress]);

	useEffect(() => {
		const detectTask = (target: EventTarget | null): string | null => {
			const card = (target as Element | null)?.closest?.("[data-task-id]");
			return card?.getAttribute("data-task-id") ?? null;
		};
		const onSelectStart = (event: Event) => {
			if (linkPressRef.current) event.preventDefault();
		};
		const onPointerMove = (event: globalThis.PointerEvent) => {
			setMilestoneLink((link) =>
				link
					? { ...link, curX: event.clientX, curY: event.clientY, targetTaskId: detectTask(event.target) }
					: link,
			);
		};
		const onPointerUp = (event: globalThis.PointerEvent) => {
			setMilestoneLink((link) => {
				if (link) {
					const taskId = detectTask(event.target);
					if (taskId) attachRef.current(taskId, link.milestoneId);
				}
				return null;
			});
			clearLinkPress();
			document.body.classList.remove("no-select");
		};

		window.addEventListener("selectstart", onSelectStart);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		return () => {
			window.removeEventListener("selectstart", onSelectStart);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			clearLinkPress();
			document.body.classList.remove("no-select");
		};
	}, [clearLinkPress]);

	return { milestoneLink, startMilestoneLink, clearLinkPress, suppressClickRef };
}
