import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

const entries = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "src/vendor/d3.v7.min.js",
  "src/vendor/lucide.min.js",
  "data/guangdong-carbon-dashboard.json"
];

await rm(distDir, { recursive: true, force: true });

for (const entry of entries) {
  const from = path.join(rootDir, entry);
  const to = path.join(distDir, entry);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

await writeFile(path.join(distDir, ".nojekyll"), "");

console.log(`Static site built at ${distDir}`);
