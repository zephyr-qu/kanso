// 轻量 API 客户端：共享访问密钥（ADR-0002）存 localStorage，请求自动带 Authorization: Bearer。
import { buildPath } from "@/lib/endpoints";
import { safeGetRaw, safeRemove, safeSetRaw } from "@/lib/safe-storage";

const KEY_STORAGE = "kanso.accessKey";

// UNAUTHORIZED_EVENT 在任一 API 返回 401 时广播，路由守卫据此清除登录态并回登录页。
export const UNAUTHORIZED_EVENT = "kanso:unauthorized";

export function getAccessKey(): string | null {
	return safeGetRaw(KEY_STORAGE);
}

export function setAccessKey(key: string): void {
	safeSetRaw(KEY_STORAGE, key);
}

export function clearAccessKey(): void {
	safeRemove(KEY_STORAGE);
}

// verifyAccessKey 校验用户输入的访问密钥（登录页专用，不携带本地密钥）。
export async function verifyAccessKey(key: string): Promise<boolean> {
	try {
		const res = await fetch(buildPath("authVerify"), {
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
		throw new Error(await errorMessage(res, path));
	}
	if (res.status === 204) {
		return undefined as T;
	}
	return res.json() as Promise<T>;
}

/** 从错误响应解析 `{ error }` 正文，附加到消息末尾（服务端文案直接透出给用户）。 */
async function errorMessage(res: Response, path: string): Promise<string> {
	const base = `API ${res.status}: ${path}`;
	try {
		const body = (await res.json()) as { error?: unknown } | null;
		if (body && typeof body.error === "string" && body.error.trim()) {
			return `${base} — ${body.error.trim()}`;
		}
	} catch {
		// 非 JSON 错误体，保留基础消息
	}
	return base;
}
