import { describe, expect, it } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { overSignal } from "@/lib/board-dnd";

function event(over: Partial<DragEndEvent["over"]>, activeRect?: Partial<DOMRect>): DragEndEvent {
	return {
		active: {
			id: "task-1",
			data: { current: null },
			rect: {
				current: {
					initial: activeRect ? ({ top: 0, height: 20, ...activeRect } as DOMRect) : null,
					translated: null,
				},
			},
		},
		over: over ? ({ id: "task-2", data: { current: { type: "task" } }, rect: { top: 0, height: 20 }, ...over } as DragEndEvent["over"]) : null,
		activatorEvent: undefined,
		collisions: null,
		delta: { x: 0, y: 0 },
		sensor: undefined,
	} as unknown as DragEndEvent;
}

describe("overSignal", () => {
	it("识别列目标", () => {
		expect(overSignal(event({ id: "column-2", data: { current: { type: "column" } } }))).toEqual({
			overId: "column-2",
			overType: "column",
			halfPassed: false,
		});
	});

	it("任务中心越过目标中心时标记 halfPassed", () => {
		expect(overSignal(event({ id: "task-2" }, { top: 10, height: 20 }))).toMatchObject({
			overId: "task-2",
			overType: "task",
			halfPassed: true,
		});
	});

	it("没有目标时返回空 ID 且不标记越过", () => {
		expect(overSignal(event(null))).toEqual({
			overId: "",
			overType: "task",
			halfPassed: false,
		});
	});
});
