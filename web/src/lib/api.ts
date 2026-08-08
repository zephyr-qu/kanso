// 轻量 API 客户端：共享访问密钥（ADR-0002）存 localStorage，请求自动带 Authorization: Bearer。

const KEY_STORAGE = "kanso.accessKey";

// UNAUTHORIZED_EVENT 在任一 API 返回 401 时广播，路由守卫据此清除登录态并回登录页。
export const UNAUTHORIZED_EVENT = "kanso:unauthorized";

export function getAccessKey(): string | null {
	return localStorage.getItem(KEY_STORAGE);
}

export function setAccessKey(key: string): void {
	localStorage.setItem(KEY_STORAGE, key);
}

export function clearAccessKey(): void {
	localStorage.removeItem(KEY_STORAGE);
}

// verifyAccessKey 校验用户输入的访问密钥（登录页专用，不携带本地密钥）。
export async function verifyAccessKey(key: string): Promise<boolean> {
	try {
		const res = await fetch("/api/auth/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const key = getAccessKey();
	const res = await fetch(path, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(key ? { Authorization: `Bearer ${key}` } : {}),
			...init.headers,
		},
	});
	if (!res.ok) {
		// 401 = 密钥失效/未认证，清除本地密钥并广播，由路由守卫引导回登录页
		if (res.status === 401) {
			clearAccessKey();
			window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
		}
		throw new Error(`API ${res.status}: ${path}`);
	}
	if (res.status === 204) {
		return undefined as T;
	}
	return res.json() as Promise<T>;
}
