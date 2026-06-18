#!/usr/bin/env node
// Refresh generator for assets/secret-patterns.json (run ~every 4 weeks).
// Forks gitleaks (config/gitleaks.toml, MIT) and OPTIMIZES to a 0-FP, JS-safe, ReDoS-safe subset:
//   1. JS-compilable
//   2. only BOUNDED quantifiers — no unbounded + / * / {n,} -> linear matching, no catastrophic backtracking
//   3. has a distinctive literal anchor (vendor prefix)
//   4. is a credential category (drops ARNs/URLs/public keys/identifiers)
//   5. deduped
// Hand-authored core patterns (with self-validating examples) are always kept.
// Usage: node scripts/build-secret-patterns.mjs <gitleaks.toml>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [gitleaksPath] = process.argv.slice(2);

// --- hand-authored core (high precision, with self-validating examples) ---
const CORE = JSON.parse(
  readFileSync(join(ROOT, "assets", "secret-patterns.core.json"), "utf8"),
);

// Validate the core examples HERE (build time), then strip them — so the SHIPPED secret-patterns.json
// contains only regex patterns and ZERO secret-shaped literal values (clean for secret scanners).
for (const p of CORE.patterns) {
  const re = new RegExp(p.regex);
  for (const m of p.examples?.match ?? [])
    if (!re.test(m))
      throw new Error(`core "${p.id}": example must match but does not: ${m}`);
  for (const n of p.examples?.noMatch ?? [])
    if (re.test(n))
      throw new Error(`core "${p.id}": example must NOT match but does: ${n}`);
}
const stripExamples = (p) => ({
  id: p.id,
  description: p.description,
  regex: p.regex,
  confidence: p.confidence ?? "high",
});

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// --- parser (no TOML dep; line-based extraction) ---
function parseGitleaks(text) {
  const out = [];
  for (const block of text.split(/^\[\[rules\]\]/m).slice(1)) {
    const id = block.match(/(?:^|\n)\s*id\s*=\s*"([^"]+)"/)?.[1];
    const desc =
      block.match(/(?:^|\n)\s*description\s*=\s*"([^"]+)"/)?.[1] ?? id;
    const regex =
      block.match(/(?:^|\n)\s*regex\s*=\s*'''([\s\S]*?)'''/)?.[1] ??
      block.match(/(?:^|\n)\s*regex\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    if (id && regex)
      out.push({ id: slug(id), description: desc, regex: regex.trim() });
  }
  return out;
}

// --- filters ---
const NON_CREDENTIAL =
  /\b(arn|url|uri|gateway|hostname|host name|domain|e-?mail|ip address|ipv[46]|uuid|mime|user.?agent|public|publishable|cron|mac address|user.?id|account.?id|tenant.?id|client.?id|app.?id|username)\b/i;

function jsCompiles(re) {
  try {
    new RegExp(re);
    return true;
  } catch {
    return false;
  }
}

// Reject any UNBOUNDED quantifier (+ * {n,}) outside a char class / escape. Bounded-only patterns
// match in linear time, so a long string literal cannot blow up the linter (ReDoS / DoS guard).
function boundedQuantifiers(re) {
  const stripped = re.replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  return !/[+*]/.test(stripped) && !/\{\d+,\}/.test(stripped);
}

function hasLiteralAnchor(re) {
  const stripped = re
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\((?:\?[:=!<][A-Za-z]*)?/g, "");
  return /[A-Za-z0-9_-]{4,}/.test(stripped);
}

// --- build ---
const raw = parseGitleaks(readFileSync(gitleaksPath, "utf8"));
const stats = {
  raw: raw.length,
  compile: 0,
  bounded: 0,
  anchor: 0,
  category: 0,
};
const seen = new Set(CORE.patterns.map((p) => p.regex));
const imported = [];
for (const r of raw) {
  if (!jsCompiles(r.regex)) continue;
  stats.compile++;
  if (!boundedQuantifiers(r.regex)) continue;
  stats.bounded++;
  if (!hasLiteralAnchor(r.regex)) continue;
  stats.anchor++;
  if (NON_CREDENTIAL.test(r.description) || NON_CREDENTIAL.test(r.id)) continue;
  stats.category++;
  if (seen.has(r.regex)) continue;
  seen.add(r.regex);
  imported.push({
    id: r.id,
    description: r.description,
    regex: r.regex,
    confidence: "high",
  });
}

const db = {
  version: CORE.version,
  source:
    "Curated high-confidence subset forked from gitleaks (github.com/gitleaks/gitleaks, MIT, (c) 2019 Zachary Rice). " +
    "Regex-deterministic vendor formats only: distinctive prefixes, no entropy, BOUNDED quantifiers (ReDoS-safe), JS-compiled. See THIRD-PARTY-LICENSES.",
  license: "MIT",
  denylist: CORE.denylist,
  patterns: [...CORE.patterns.map(stripExamples), ...imported],
};
writeFileSync(
  join(ROOT, "assets", "secret-patterns.json"),
  JSON.stringify(db, null, 2) + "\n",
);
console.log("Filter funnel:", JSON.stringify(stats));
console.log(
  `core=${CORE.patterns.length} imported=${imported.length} total=${db.patterns.length}`,
);
console.log(
  "sample imported:",
  imported
    .slice(0, 12)
    .map((p) => p.id)
    .join(", "),
);
