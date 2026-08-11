// 最近打开项目记录：写入/读取、去重置顶、工作区隔离与 limit。
import { beforeEach, describe, expect, it } from "vitest";
import { getRecentProjects, recordProjectOpen } from "@/lib/recent-projects";

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k) => map.get(k) ?? null,
		key: (i) => [...map.keys()][i] ?? null,
		removeItem: (k) => void map.delete(k),
		setItem: (k, v) => void map.set(k, v),
	};
}

beforeEach(() => {
	const storage = memoryStorage();
	Object.defineProperty(globalThis, "window", {
		value: { localStorage: storage },
		configurable: true,
		writable: true,
	});
});

describe("recordProjectOpen / getRecentProjects", () => {
	it("按打开时间倒序，最新在前", () => {
		recordProjectOpen("w1", "p1");
		recordProjectOpen("w1", "p2");
		recordProjectOpen("w1", "p3");
		expect(getRecentProjects("w1", 5).map((e) => e.projectId)).toEqual([
			"p3",
			"p2",
			"p1",
		]);
	});

	it("重复打开同一项目去重置顶", () => {
		recordProjectOpen("w1", "p1");
		recordProjectOpen("w1", "p2");
		recordProjectOpen("w1", "p1");
		expect(getRecentProjects("w1", 5).map((e) => e.projectId)).toEqual([
			"p1",
			"p2",
		]);
	});

	it("按工作区隔离", () => {
		recordProjectOpen("w1", "p1");
		recordProjectOpen("w2", "p2");
		expect(getRecentProjects("w1", 5).map((e) => e.projectId)).toEqual(["p1"]);
		expect(getRecentProjects("w2", 5).map((e) => e.projectId)).toEqual(["p2"]);
	});

	it("limit 生效", () => {
		recordProjectOpen("w1", "p1");
		recordProjectOpen("w1", "p2");
		recordProjectOpen("w1", "p3");
		expect(getRecentProjects("w1", 2)).toHaveLength(2);
	});
});
