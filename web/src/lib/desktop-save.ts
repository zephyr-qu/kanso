// 桌面壳（MyGo）里的文件保存：交给 Go 弹系统的「另存为」对话框并写盘（M6-4）。
// 这样导出不依赖各平台 WebView 对 blob 下载的支持差异；浏览器里这些函数返回 false，
// 调用方回退到原来的 blob / data URL 下载。

// window.mygo 是 MyGo 注入的运行时；这里只用它的通用 call()，不引入 mygo-runtime 依赖。
type MyGoBridge = {
	call?: <T>(method: string, ...args: unknown[]) => Promise<T>;
};

function bridge(): MyGoBridge | undefined {
	if (typeof window === "undefined") return undefined;
	return (window as unknown as { mygo?: MyGoBridge }).mygo;
}

/** isDesktopShell 判断页面是否跑在桌面壳里（浏览器里为 false）。 */
export function isDesktopShell(): boolean {
	return typeof bridge()?.call === "function";
}

/** saveBlobInDesktop 让桌面壳保存 Blob；返回 true 表示已交给桌面壳。 */
export async function saveBlobInDesktop(name: string, data: Blob): Promise<boolean> {
	const call = bridge()?.call;
	if (typeof call !== "function") return false;
	const bytes = new Uint8Array(await data.arrayBuffer());
	await call("Exporter.SaveFile", name, base64Of(bytes));
	return true;
}

/** saveDataUrlInDesktop 保存 data URL（分享卡 PNG 就是这种）；返回 true 表示已交给桌面壳。 */
export async function saveDataUrlInDesktop(name: string, dataUrl: string): Promise<boolean> {
	const call = bridge()?.call;
	if (typeof call !== "function") return false;
	await call("Exporter.SaveFile", name, base64OfDataUrl(dataUrl));
	return true;
}

/** base64Of 把字节编码成 base64；分块处理，避免大文件撑爆参数栈。 */
export function base64Of(bytes: Uint8Array): string {
	const chunk = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/** base64OfDataUrl 取 data URL 的 base64 部分；不是 base64 的 data URL 会抛错。 */
export function base64OfDataUrl(dataUrl: string): string {
	const marker = ";base64,";
	const at = dataUrl.indexOf(marker);
	if (!dataUrl.startsWith("data:") || at < 0) {
		throw new Error("不是 base64 编码的 data URL");
	}
	return dataUrl.slice(at + marker.length);
}
