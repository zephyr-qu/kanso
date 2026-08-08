// 登录态 store（zustand）：来源是 localStorage 中的访问密钥（ADR-0002）。
// 401 事件由 api.ts 广播，这里同步清空登录态，路由守卫据此重定向。
import { create } from "zustand";
import { clearAccessKey, getAccessKey, UNAUTHORIZED_EVENT } from "@/lib/api";

type AuthState = {
	isAuthenticated: boolean;
	// login 在 verifyAccessKey 通过后调用（密钥已写入 localStorage）。
	login: () => void;
	// logout 清除本地密钥并回到未登录态。
	logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
	isAuthenticated: getAccessKey() !== null,
	login: () => set({ isAuthenticated: true }),
	logout: () => {
		clearAccessKey();
		set({ isAuthenticated: false });
	},
}));

// 任一 API 401：本地密钥已被清除，同步 store 状态触发路由守卫重定向。
window.addEventListener(UNAUTHORIZED_EVENT, () => {
	useAuthStore.setState({ isAuthenticated: false });
});
