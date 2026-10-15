// 生成社交分享卡 og:image（1200x630），供独立站点对外分享使用。
// 卡片版面在脚本里内联，避免往站点目录里塞一个会被公开访问的中间 HTML。
//
// 用法：pnpm --dir web exec node tools/build-og-card.mjs
// 产物：apps/landing/media/og-card.png
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const LANDING = path.resolve(import.meta.dirname, "../../apps/landing");
const OUT = path.join(LANDING, "media", "og-card.png");
const NOISE =
	"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E\")";

const html = (board, mark) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>
	* { margin: 0; box-sizing: border-box; }
	html, body { width: 1200px; height: 630px; }
	.card {
		position: relative; display: flex; flex-direction: column; justify-content: center; gap: 24px;
		width: 1200px; height: 630px; padding: 0 76px; overflow: hidden;
		background: #f7f5f0; color: #292722;
		font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
	}
	.card::after { content: ""; position: absolute; inset: 0; opacity: 0.045; background-image: ${NOISE}; }
	.brand { display: flex; align-items: center; gap: 13px; font-size: 27px; font-weight: 700; letter-spacing: -0.02em; }
	/* 直接复用 favicon（应用图标）本身：卡上的 mark 与应用图标是同一份矢量，不再用字体画字。 */
	.mark { display: block; width: 46px; height: 46px; }
	h1 { max-width: 640px; font-size: 70px; font-weight: 700; letter-spacing: -0.035em; line-height: 1.14; }
	.lede { max-width: 470px; color: #6d675e; font-size: 22px; line-height: 1.6; }
	.repo { color: #a29c93; font-family: ui-monospace, Consolas, monospace; font-size: 18px; letter-spacing: 0.02em; }
	.shot {
		position: absolute; right: -84px; bottom: -76px; width: 690px;
		border: 1px solid rgba(55, 53, 47, 0.16); border-radius: 16px;
		box-shadow: 0 26px 64px rgba(55, 53, 47, 0.2);
	}
</style></head>
<body>
	<div class="card">
		<div class="brand"><img class="mark" src="data:image/svg+xml;base64,${mark}" alt="" /><span>Kanso</span></div>
		<h1>把事情，放回<br />它该在的位置</h1>
		<p class="lede">安静、克制的看板工作台 · 单机部署，数据留在自己手里</p>
		<p class="repo">github.com/zephyr-qu/kanso</p>
		<img class="shot" src="data:image/png;base64,${board}" alt="" />
	</div>
</body>
</html>`;

async function main() {
	const board = (await fs.readFile(path.join(LANDING, "media", "app-board.png"))).toString("base64");
	const mark = (await fs.readFile(path.join(LANDING, "favicon.svg"))).toString("base64");
	const browser = await chromium.launch({ channel: "chrome" });
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
	await page.setContent(html(board, mark), { waitUntil: "load" });
	await page.screenshot({ path: OUT });
	await browser.close();
	const { size } = await fs.stat(OUT);
	console.log(`${path.relative(process.cwd(), OUT)}  ${(size / 1024).toFixed(0)} KB`);
}

await main();
