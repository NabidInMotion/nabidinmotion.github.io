/**
 * Download self-hosted Inter + JetBrains Mono woff2 files for subscriber-site.
 * Sources: @fontsource packages (OFL-1.1). Re-run after fonts.css changes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "subscriber-site/assets/fonts");

const VERSIONS = {
  inter: "5.2.5",
  "jetbrains-mono": "5.2.5",
};

const FILES = [
  { pkg: "inter", file: "inter-latin-400-normal.woff2" },
  { pkg: "inter", file: "inter-latin-600-normal.woff2" },
  { pkg: "inter", file: "inter-latin-700-normal.woff2" },
  { pkg: "inter", file: "inter-latin-900-normal.woff2" },
  { pkg: "jetbrains-mono", file: "jetbrains-mono-latin-500-normal.woff2" },
  { pkg: "jetbrains-mono", file: "jetbrains-mono-latin-600-normal.woff2" },
];

async function fetchFont({ pkg, file }) {
  const version = VERSIONS[pkg];
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${pkg}@${version}/files/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) {
    throw new Error(`Suspiciously small font file: ${file} (${buf.length} bytes)`);
  }
  const dest = path.join(outDir, file);
  await writeFile(dest, buf);
  console.log(`  ok ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  console.log(`Writing fonts to ${outDir}`);
  for (const entry of FILES) {
    await fetchFont(entry);
  }
  console.log(`\n${FILES.length} font files ready.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
