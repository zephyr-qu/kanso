// 备份导入 E2E：导出快照 → 制造新数据 → 导入恢复（全量覆盖）→ 校验还原。
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { api, loginToApp, resetAndSeed } from "./seed";

test.beforeEach(async () => {
	await resetAndSeed();
});
test("导出 → 造数据 → 导入恢复（覆盖当前数据）", async ({ page }) => {
	// 1. 登录并打开设置页（数据卡：导出/导入备份）。
	await loginToApp(page);
	await page.goto("/settings");
	await expect(page.getByRole("button", { name: "导出备份" })).toBeVisible();

	// 2. 导出备份快照并落盘。
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "导出备份" }).click();
	const download = await downloadPromise;
	const backupPath = test.info().outputPath("backup.json");
	await download.saveAs(backupPath);
	const snapshot = JSON.parse(readFileSync(backupPath, "utf8"));
	expect(snapshot.workspaces?.length).toBeGreaterThan(0);
	expect(
		snapshot.projects?.some((p: { name: string }) => p.name === "原型演示"),
	).toBe(true);

	// 3. 制造新数据：给「看板冒烟」的待办列加一个任务。
	const ws = (
		(await (await api("/api/workspaces")).json()) as { id: string }[]
	)[0];
	const projects = (await (
		await api(`/api/workspaces/${ws.id}/projects`)
	).json()) as { id: string; name: string }[];
	const smoke = projects.find((p) => p.name === "看板冒烟");
	expect(smoke).toBeDefined();
	const board = (await (await api(`/api/projects/${smoke!.id}`)).json()) as {
		columns: { id: string; name: string }[];
	};
	const todo = board.columns.find((c) => c.name === "待办");
	expect(todo).toBeDefined();
	const created = (await (
		await api(`/api/columns/${todo!.id}/tasks`, {
			method: "POST",
			body: JSON.stringify({ title: "导入前临时任务" }),
		})
	).json()) as { id: string };
	expect(created.id).toBeTruthy();

	// 4. 导入备份：选文件 → 确认覆盖弹窗 → 成功后页面刷新。
	const postResp = page.waitForResponse(
		(r) =>
			r.url().includes("/api/settings/backup") && r.request().method() === "POST",
	);
	page.once("dialog", (d) => void d.accept());
	await page.locator('input[type="file"]').setInputFiles(backupPath);
	const importResponse = await postResp;
	expect(importResponse.status()).toBe(200);
	// 导入是全量替换，成功后前端 window.location.reload()。
	await page.waitForLoadState("networkidle").catch(() => {});

	// 5. 校验：临时任务被清除、种子任务还原（快照覆盖）。
	const boardAfter = (await (
		await api(`/api/projects/${smoke!.id}`)
	).json()) as {
		columns: { name: string; tasks: { title: string }[] }[];
	};
	const titlesAfter = boardAfter.columns.flatMap((c) =>
		c.tasks.map((t) => t.title),
	);
	expect(titlesAfter).not.toContain("导入前临时任务");
	expect(titlesAfter).toContain("faf faf");
	expect(titlesAfter).toContain("fafw");

	// UI 刷新后回到设置页且仍可用。
	await expect(page.getByRole("button", { name: "导出备份" })).toBeVisible();
});
