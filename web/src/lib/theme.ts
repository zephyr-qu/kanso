// 主题偏好：亮色 / 暗色 / 跟随系统。
// 存 localStorage（kanso.theme），应用为 html.dark 类（Tailwind v4 @custom-variant dark 按 .dark 祖先切换）。
import { safeGetRaw, safeSetRaw } from "@/lib/safe-storage";

export type Theme = "light" | "dark" | "system";

export const THEMES: { id: Theme; label: string }[] = [
	{ id: "light", label: "亮色" },
	{ id: "dark", label: "暗色" },
	{ id: "system", label: "跟随系统" },
];

const THEME_KEY = "kanso.theme";

function media(): MediaQueryList | null {
	return typeof window === "undefined"
		? null
		: window.matchMedia("(prefers-color-scheme: dark)");
}

/** 解析实际生效的明暗（system 依系统偏好）。 */
function resolve(theme: Theme): "light" | "dark" {
	if (theme === "system") {
		return media()?.matches ? "dark" : "light";
	}
	return theme;
}

/** 把主题应用到 html.dark 类。 */
export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
}

/** 当前偏好（缺省跟随系统）。 */
export function getTheme(): Theme {
	const v = safeGetRaw(THEME_KEY);
	return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function setTheme(theme: Theme): void {
	safeSetRaw(THEME_KEY, theme);
	applyTheme(theme);
}

/** 应用启动时调用一次：首屏渲染前设好主题，并跟随系统变化实时切换。 */
export function initTheme(): void {
	applyTheme(getTheme());
	media()?.addEventListener("change", () => applyTheme(getTheme()));
}
