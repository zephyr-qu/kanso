// 团队模式 E2E：管理员/成员双身份覆盖成员治理和密钥生命周期。
import { expect, test } from "@playwright/test";
import { api, loginToApp, resetAndSeed } from "./seed";

const base = process.env.KANSO_API_URL ?? `http://127.0.0.1:${process.env.KANSO_E2E_API_PORT ?? "8080"}`;

async function memberApi(key: string, path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${base}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
}

test.beforeEach(async () => {
	await resetAndSeed();
});

test("admin/member 双身份：工作区团队页、密钥撤销与管理员并存", async ({ page }) => {
	test.skip(process.env.KANSO_MODE !== "team", "仅在 KANSO_MODE=team 时运行");

	const workspace = ((await (await api("/api/workspaces")).json()) as { id: string }[])[0];
	const created = await api("/api/members", {
		method: "POST",
		body: JSON.stringify({ name: "协作者" }),
	});
	expect(created.status).toBe(201);
	const member = (await created.json()) as { id: string };
	const granted = await api(`/api/workspaces/${workspace.id}/members`, {
		method: "POST",
		body: JSON.stringify({ memberId: member.id }),
	});
	expect(granted.status).toBe(204);

	await loginToApp(page);
	await page.goto(`/w/${workspace.id}/team`);
	await expect(page.getByRole("heading", { name: "团队" })).toBeVisible();
	await expect(page.getByText("协作者")).toBeVisible();

	const rotated = await api(`/api/members/${member.id}/key`, { method: "POST" });
	expect(rotated.status).toBe(200);
	const memberKey = ((await rotated.json()) as { key: string }).key;
	const revoked = await api(`/api/members/${member.id}/key`, { method: "DELETE" });
	expect(revoked.status).toBe(204);
	const oldKey = await memberApi(memberKey, "/api/me");
	expect(oldKey.status).toBe(401);

	const reissued = await api(`/api/members/${member.id}/key`, { method: "POST" });
	expect(reissued.status).toBe(200);
	const currentKey = ((await reissued.json()) as { key: string }).key;
	const memberIdentity = await memberApi(currentKey, "/api/me");
	expect(memberIdentity.status).toBe(200);

	const promoted = await api(`/api/members/${member.id}/role`, {
		method: "PATCH",
		body: JSON.stringify({ role: "admin" }),
	});
	expect(promoted.status).toBe(200);
	const oldOwnerManagement = await memberApi("mock-key", "/api/workspaces", {
		method: "POST",
		body: JSON.stringify({ name: "不应创建" }),
	});
	expect(oldOwnerManagement.status).toBe(201);
});
