import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { loadMockDb } from "./mock-db";

export const server = setupServer(...handlers);

export function startMockServer(): void {
	loadMockDb();
	server.listen({ onUnhandledRequest: "error" });
}
