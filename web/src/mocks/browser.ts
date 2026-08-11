// MSW 浏览器 worker 入口：main.tsx 在开发模式启用。
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
