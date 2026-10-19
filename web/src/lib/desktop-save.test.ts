// 桌面壳保存（M6-4）：浏览器里必须完全不介入（回退到原来的下载），桌面壳里才调 Go。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	base64Of,
	base64OfDataUrl,
	isDesktopShell,
	saveBlobInDesktop,
	saveDataUrlInDesktop,
} from "./desktop-save";

type WithWindow = { window?: unknown };

function setBridge(bridge: unknown) {
	(globalThis as WithWindow).window = { mygo: bridge };
}

afterEach(() => {
	delete (globalThis as WithWindow).window;
	vi.restoreAllMocks();
});

describe("desktop-save", () => {
	it("浏览器里不介入：不当作桌面壳，保存请求一律返回 false", async () => {
		expect(isDesktopShell()).toBe(false);
		expect(await saveBlobInDesktop("a.json", new Blob(["{}"]))).toBe(false);
		expect(await saveDataUrlInDesktop("a.png", "data:image/png;base64,AAAA")).toBe(false);
	});

	it("桌面壳里把 Blob 交给 Go 保存", async () => {
		const call = vi.fn().mockResolvedValue("/tmp/x.json");
		setBridge({ call });
		expect(isDesktopShell()).toBe(true);
		expect(await saveBlobInDesktop("备份.json", new Blob(['{"a":1}']))).toBe(true);
		expect(call).toHaveBeenCalledWith(
			"Exporter.SaveFile",
			"备份.json",
			base64Of(new TextEncoder().encode('{"a":1}')),
		);
	});

	it("data URL 直接取 base64 段，不重新编码", async () => {
		const call = vi.fn().mockResolvedValue("/tmp/x.png");
		setBridge({ call });
		expect(await saveDataUrlInDesktop("卡.png", "data:image/png;base64,QUJD")).toBe(true);
		expect(call).toHaveBeenCalledWith("Exporter.SaveFile", "卡.png", "QUJD");
		expect(() => base64OfDataUrl("data:text/plain,abc")).toThrow();
	});
});
