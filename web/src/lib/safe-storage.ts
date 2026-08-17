// 最小 localStorage 适配器：消除「try/catch + JSON.parse + 静默失败」样板（架构候选 5）。
// 只保证：读不抛错（损坏回退 undefined/null）、写失败静默。版本语义/归一化逻辑留在各模块。
function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

/** 读 JSON：无值 / 损坏 / 环境无 localStorage 时返回 undefined（不抛错）。 */
export function safeReadJSON<T>(key: string): T | undefined {
	const s = storage();
	if (!s) return undefined;
	try {
		const raw = s.getItem(key);
		if (raw == null) return undefined;
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

/** 写 JSON：隐私模式/配额不足时静默失败。 */
export function safeWriteJSON(key: string, value: unknown): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(key, JSON.stringify(value));
	} catch {
		// 静默失败（尽力而为）
	}
}

/** 读原始字符串（非 JSON 场景，如访问密钥）。 */
export function safeGetRaw(key: string): string | null {
	const s = storage();
	if (!s) return null;
	try {
		return s.getItem(key);
	} catch {
		return null;
	}
}

/** 写原始字符串。 */
export function safeSetRaw(key: string, value: string): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(key, value);
	} catch {
		// 静默失败
	}
}

/** 删除。 */
export function safeRemove(key: string): void {
	const s = storage();
	if (!s) return;
	try {
		s.removeItem(key);
	} catch {
		// 静默失败
	}
}
