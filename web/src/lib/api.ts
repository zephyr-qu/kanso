// 轻量 API 客户端：共享访问密钥（ADR-0002）存 localStorage，请求自动带 Authorization: Bearer。

const KEY_STORAGE = "kanso.accessKey";

export function getAccessKey(): string | null {
	return localStorage.getItem(KEY_STORAGE);
}

export function setAccessKey(key: string): void {
	localStorage.setItem(KEY_STORAGE, key);
}

export function clearAccessKey(): void {
	localStorage.removeItem(KEY_STORAGE);
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
		// 401 = 密钥失效/未认证，清除本地密钥，由路由守卫引导回登录页
		if (res.status === 401) {
			clearAccessKey();
		}
		throw new Error(`API ${res.status}: ${path}`);
	}
	return res.json() as Promise<T>;
}
