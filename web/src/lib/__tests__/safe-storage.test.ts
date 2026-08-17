// safe-storage 适配器测试：损坏回退、静默失败、读写往返。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	safeGetRaw,
	safeReadJSON,
	safeRemove,
	safeSetRaw,
	safeWriteJSON,
} from "@/lib/safe-storage";

function installFakeStorage(
	overrides: Partial<Storage> = {},
): Map<string, string> {
	const store = new Map<string, string>();
	const fake: Storage = {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key) => store.get(key) ?? null,
		key: (index) => [...store.keys()][index] ?? null,
		removeItem: (key) => void store.delete(key),
		setItem: (key, value) => void store.set(key, String(value)),
		...overrides,
	};
	(globalThis as unknown as { window: unknown }).window = {
		localStorage: fake,
	};
	return store;
}

beforeEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
});

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
});

describe("safeReadJSON", () => {
	it("无 localStorage（node 环境）时返回 undefined，不抛错", () => {
		expect(safeReadJSON("k")).toBeUndefined();
		expect(safeWriteJSON("k", { a: 1 })).toBeUndefined();
	});

	it("损坏 JSON 回退 undefined", () => {
		const store = installFakeStorage();
		store.set("k", "{not-json");
		expect(safeReadJSON<unknown>("k")).toBeUndefined();
	});

	it("合法 JSON 返回解析值；无值返回 undefined", () => {
		const store = installFakeStorage();
		store.set("k", JSON.stringify({ a: 1 }));
		expect(safeReadJSON<{ a: number }>("k")).toEqual({ a: 1 });
		expect(safeReadJSON("missing")).toBeUndefined();
	});
});

describe("读写往返", () => {
	it("safeWriteJSON → safeReadJSON 往返", () => {
		installFakeStorage();
		safeWriteJSON("k", [1, 2, 3]);
		expect(safeReadJSON<number[]>("k")).toEqual([1, 2, 3]);
	});

	it("safeGetRaw/safeSetRaw/safeRemove", () => {
		installFakeStorage();
		safeSetRaw("k", "raw-value");
		expect(safeGetRaw("k")).toBe("raw-value");
		safeRemove("k");
		expect(safeGetRaw("k")).toBeNull();
	});
});

describe("静默失败", () => {
	it("setItem 抛错时写不抛（配额/隐私模式）", () => {
		installFakeStorage({
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		});
		expect(() => safeWriteJSON("k", { big: "data" })).not.toThrow();
		expect(() => safeSetRaw("k", "x")).not.toThrow();
	});

	it("getItem 抛错时读回退", () => {
		installFakeStorage({
			getItem: () => {
				throw new Error("SecurityError");
			},
		});
		expect(safeReadJSON<unknown>("k")).toBeUndefined();
		expect(safeGetRaw("k")).toBeNull();
	});
});
