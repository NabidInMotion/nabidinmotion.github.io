/**
 * Replace em-dash clause glue in markdown body lines (not structural headers).
 * Usage: node scripts/fix-em-dash-prose.cjs [rootDir]
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || "road-to-machine-learning");
const EM = "\u2014";

function isStructuralHeader(line) {
  return /^#{1,6}\s/.test(line) && line.includes(EM);
}

function fixProseLine(line) {
  const token = ` ${EM} `;
  if (isStructuralHeader(line) || !line.includes(token)) return line;

  let out = line;
  out = out.replace(/(\]\([^)]+\))\s+\u2014\s+/g, "$1: ");
  out = out.replace(/\)\s+\u2014\s+([a-z])/g, (_, c) => `). ${c.toUpperCase()}`);
  out = out.replace(/\)\s+\u2014\s+/g, "). ");
  out = out.replace(/(\S)\s+\u2014\s+([a-z])/g, (_, b, c) => `${b}. ${c.toUpperCase()}`);
  out = out.replace(/(\S)\s+\u2014\s+([A-Z("(])/g, "$1. $2");
  out = out.replace(/(\S)\s+\u2014\s+(\*\*)/g, "$1. $2");
  out = out.replace(/\s+\u2014\s+/g, ", ");
  return out;
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === ".git" || name === "node_modules" || name === "venv") continue;
      walk(p);
    } else if (name.endsWith(".md")) {
      const raw = fs.readFileSync(p, "utf8");
      const next = raw.split("\n").map(fixProseLine).join("\n");
      if (next !== raw) {
        fs.writeFileSync(p, next);
        console.log(path.relative(process.cwd(), p));
      }
    }
  }
}

walk(root);
