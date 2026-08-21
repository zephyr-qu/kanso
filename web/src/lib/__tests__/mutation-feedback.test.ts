import { describe, expect, it } from "vitest";
import {
	mutationErrorDescription,
	readMutationFeedback,
} from "@/lib/mutation-feedback";

describe("mutation feedback", () => {
	it("优先展示 API 返回的业务错误", () => {
		expect(mutationErrorDescription(new Error("API 400: /api/tasks — 标题不能为空"))).toBe("标题不能为空");
	});

	it("统一网络错误文案", () => {
		expect(mutationErrorDescription(new Error("Failed to fetch"))).toBe("网络连接失败，请检查网络后重试");
	});

	it("安全读取 mutation meta", () => {
		expect(readMutationFeedback({ feedback: { success: "已保存", errorTitle: "保存失败" } })).toEqual({
		 success: "已保存",
		 errorTitle: "保存失败",
		});
		expect(readMutationFeedback(null)).toEqual({});
	});
});
