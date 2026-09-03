import { describe, expect, it } from "vitest";
import {
	projectIdFromPathname,
	resolveWorkspace,
	workspaceDashboardPath,
	workspaceIdFromPathname,
} from "@/lib/workspace-context";

const workspaces = [
	{ id: "w1", name: "一号", createdAt: "" },
	{ id: "w2", name: "二号", createdAt: "" },
];

describe("workspace context", () => {
	it("uses the URL as the workspace source", () => {
		expect(workspaceIdFromPathname("/w/w2/activity")).toBe("w2");
		expect(projectIdFromPathname("/w/w2/p/p9/t/t1")).toBe("p9");
		expect(resolveWorkspace("/w/w2/dashboard", workspaces, "success")).toMatchObject({
			status: "ready",
			workspace: { id: "w2" },
		});
	});

	it("does not fall back while loading or when the URL is unavailable", () => {
		expect(resolveWorkspace("/w/w2/dashboard", undefined, "loading").status).toBe("loading");
		expect(resolveWorkspace("/w/missing/dashboard", workspaces, "success").status).toBe("unavailable");
		expect(resolveWorkspace("/w/w2/dashboard", [], "success").status).toBe("empty");
	});

	it("switches into the target dashboard", () => {
		expect(workspaceDashboardPath("w2")).toBe("/w/w2/dashboard");
	});
});
