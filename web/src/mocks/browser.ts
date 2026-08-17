import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { loadMockDb } from "./mock-db";

export const worker = setupWorker(...handlers);

export async function startMockWorker(): Promise<void> {
	loadMockDb();
	await worker.start({ onUnhandledRequest: "bypass" });
}
