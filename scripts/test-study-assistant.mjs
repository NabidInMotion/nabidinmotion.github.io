/**
 * Unit tests for study assistant retrieval (no browser).
 * Run: node scripts/test-study-assistant.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveRankedSources } from "../subscriber-site/js/study-assistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, "../subscriber-site/content/search-index.json");

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const raw = await fs.readFile(indexPath, "utf8");
  const index = JSON.parse(raw);

  const empty = retrieveRankedSources(index, "");
  record("Empty query returns no sources", empty.length === 0);

  const short = retrieveRankedSources(index, "a");
  record("Single-char query returns no sources", short.length === 0);

  const gd = retrieveRankedSources(index, "gradient descent");
  record("Known topic returns matches", gd.length > 0, `${gd.length} hits`);
  record(
    "Top hit has positive score",
    gd[0]?.score >= 1,
    gd[0]?.entry?.title || "none"
  );

  const nonsense = retrieveRankedSources(index, "xyzzyplughfegoogle");
  record("Nonsense query returns no sources", nonsense.length === 0);

  const filtered = retrieveRankedSources(index, "python", {
    moduleSlugs: ["00-prerequisites"],
  });
  record(
    "Career filter limits modules",
    filtered.every((r) => r.entry.type === "guide" || r.entry.module === "00-prerequisites"),
    `${filtered.length} in prerequisites`
  );

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nStudy assistant unit tests: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
