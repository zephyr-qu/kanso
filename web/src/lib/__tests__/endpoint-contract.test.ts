import { describe, expect, it } from "vitest";
import { ENDPOINT_TEMPLATES, mswPattern } from "@/lib/endpoints";
import { handlers } from "@/mocks/handlers";

describe("API / Mock endpoint contract", () => {
	it("每个 endpoint 模板至少有一个 MSW handler", () => {
		const handlerPaths = new Set(
			handlers.map((handler) => (handler as { info?: { path?: string } }).info?.path),
		);

		for (const [name] of Object.entries(ENDPOINT_TEMPLATES)) {
			expect(handlerPaths, `${name} 缺少 MSW handler`).toContain(mswPattern(name as keyof typeof ENDPOINT_TEMPLATES));
		}
	});
});
