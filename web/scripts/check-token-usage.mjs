import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const rootPath = process.cwd();
const targets = ["components", "pages"];
const ignoredFiles = new Set([
  "components/ui/",
  "components/label-manager.tsx",
  "pages/labels.tsx",
]);
const findings = [];

async function walk(path, rootPath) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) await walk(next, rootPath);
    if (!entry.isFile() || !/\.(tsx|ts)$/.test(entry.name)) continue;

    const source = await readFile(next, "utf8");
    const relativePath = relative(rootPath, next).replaceAll("\\", "/");
    if ([...ignoredFiles].some((pattern) => relativePath === pattern || relativePath.startsWith(pattern))) continue;
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes("style={{ backgroundColor: label.color }}")) return;
      if (/(#[0-9a-f]{3,8}|rgba?\(|shadow-\[(?!none)|bg-white|dark:bg-)/i.test(line)) {
        findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

const sourceRoot = join(rootPath, "src");
for (const target of targets) await walk(join(sourceRoot, target), sourceRoot);

if (findings.length) {
  console.error(`Token audit found ${findings.length} existing visual escape(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  console.error("Use semantic or component tokens for new visual styles; data-driven label colors are allowed.");
  process.exitCode = 1;
} else {
  console.log("Token audit passed: no forbidden visual escapes found.");
}
