// Validate generated data files against the enrichment inputs.
// Usage: node tools/validate_data.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/enrich-input/manifest.json"), "utf8"));

const LEVEL_KEYS = { prea1: "PREA1", a1: "A1", a2: "A2" };
const norm = s => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

let problems = 0;
const loaded = { PREA1: [], A1: [], A2: [] };

for (const [name, info] of Object.entries(manifest)) {
  const file = path.join(ROOT, "js/data", `words-${name}.js`);
  if (!fs.existsSync(file)) { console.log(`MISSING  ${name}`); problems++; continue; }
  const sandbox = { window: {} };
  try {
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  } catch (e) {
    console.log(`SYNTAX   ${name}: ${e.message}`);
    problems++;
    continue;
  }
  const arr = (sandbox.window.WG_DATA || {})[LEVEL_KEYS[info.level]] || [];
  const inputs = JSON.parse(fs.readFileSync(path.join(ROOT, info.path), "utf8"));

  const issues = [];
  if (arr.length !== inputs.length) issues.push(`count ${arr.length} != input ${inputs.length}`);

  const inNorm = new Set(inputs.map(i => norm(i.w)));
  for (const r of arr) {
    const where = `${name}[${r.w}]`;
    if (!r.w || !r.t || !r.vn || !r.en || !r.ex) { issues.push(`${where}: missing core field`); continue; }
    if ("e" in r === false) issues.push(`${where}: missing e`);
    if (typeof r.ex === "string" && r.ex.includes('"')) issues.push(`${where}: raw quote in ex`);
    if (!norm(r.ex).includes(norm(r.w).split(" ")[0])) issues.push(`${where}: ex does not contain word`);
    if (!inNorm.has(norm(r.w))) issues.push(`${where}: not in input list`);
    if (r.e && r.e.length > 4 && !/\p{Extended_Pictographic}/u.test(r.e)) issues.push(`${where}: e not emoji`);
  }
  loaded[LEVEL_KEYS[info.level]].push(...arr);

  if (issues.length) {
    problems += issues.length;
    console.log(`ISSUES   ${name}: ${issues.length}`);
    issues.slice(0, 12).forEach(i => console.log("   - " + i));
  } else {
    console.log(`OK       ${name}: ${arr.length} entries`);
  }
}

for (const [k, arr] of Object.entries(loaded)) {
  const seen = new Set();
  let dup = 0;
  arr.forEach(r => { const n = norm(r.w); if (seen.has(n)) dup++; seen.add(n); });
  console.log(`LEVEL ${k}: ${arr.length} entries, ${dup} duplicates`);
}

console.log(problems ? `\n${problems} problem(s) found` : "\nAll data files valid ✔");
process.exit(problems ? 1 : 0);
