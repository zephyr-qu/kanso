import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};

/** Serve ../landing as a standalone site at / during Vite dev (mirrors production). */
export function kansoLanding(): Plugin {
	const root = path.resolve(import.meta.dirname, "../landing");

	function resolveLandingFile(urlPath: string): string | null {
		const rel =
			urlPath === "/" || urlPath === "/index.html"
				? "index.html"
				: decodeURIComponent(urlPath.replace(/^\//, ""));
		if (
			rel !== "index.html" &&
			rel !== "style.css" &&
			rel !== "favicon.svg" &&
			!rel.startsWith("fonts/")
		) {
			return null;
		}
		const file = path.resolve(root, rel);
		if (!file.startsWith(root + path.sep) && file !== root) {
			return null;
		}
		if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			return null;
		}
		return file;
	}

	return {
		name: "kanso-landing",
		configureServer(server) {
			const middleware: Connect.NextHandleFunction = (req, res, next) => {
				if (req.method !== "GET" && req.method !== "HEAD") {
					next();
					return;
				}
				const urlPath = req.url?.split("?")[0] ?? "";
				const file = resolveLandingFile(urlPath);
				if (!file) {
					next();
					return;
				}
				const ext = path.extname(file);
				res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
				if (req.method === "HEAD") {
					res.end();
					return;
				}
				fs.createReadStream(file).pipe(res);
			};
			// Run before Vite's SPA history fallback so "/" stays the static landing.
			server.middlewares.use(middleware);
		},
	};
}
