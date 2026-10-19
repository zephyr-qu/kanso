// 生成应用图标：把 web/public/favicon.svg（品牌 mark）渲染成 1024×1024 的透明底 PNG，
// 产物是 resources/icon.png，供 MyGo 打包使用（见 mygo.json 的 icon）。
//
// 用法：pnpm --dir web exec node tools/build-app-icon.mjs
// 依赖 Playwright 的 chromium（与 e2e 相同：pnpm exec playwright install chromium）。
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const require = createRequire(path.join(repo, "web", "package.json"));
const { chromium } = require("@playwright/test");

const size = 1024;
const svg = readFileSync(path.join(repo, "web", "public", "favicon.svg"), "utf8");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
await browser.close();

const outDir = path.join(repo, "resources");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "icon.png");
writeFileSync(out, png);
console.log(`写入 ${out}（${png.length} 字节）`);
