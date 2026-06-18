// Flags hardcoded vendor credentials in string literals, matched against a curated, self-validating
// pattern database (assets/secret-patterns.json — forked from gitleaks, MIT; see THIRD-PARTY-LICENSES).
// Deterministic: distinctive vendor formats only, no entropy, no name heuristics. The pattern DB is
// validated against its own embedded examples once at load (fail-fast). Override the DB path via the
// DLINT_SECRET_PATTERNS_PATH env var. Self-contained: no shared rule helpers.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface SecretPattern {
  id: string;
  description: string;
  regex: string;
  examples?: { match?: string[]; noMatch?: string[] };
}
interface SecretDb {
  version: string;
  denylist?: string[];
  patterns: SecretPattern[];
}

function loadPatternDb(): {
  patterns: { id: string; description: string; re: RegExp }[];
  gate: RegExp;
  denylist: Set<string>;
} {
  const dbPath =
    process.env.DLINT_SECRET_PATTERNS_PATH ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "secret-patterns.json");
  const db = JSON.parse(readFileSync(dbPath, "utf8")) as SecretDb;
  const patterns = db.patterns.map((p) => {
    const re = new RegExp(p.regex);
    for (const sample of p.examples?.match ?? [])
      if (!re.test(sample))
        throw new Error(`no-secrets pattern "${p.id}": example must match but does not: ${sample}`);
    for (const sample of p.examples?.noMatch ?? [])
      if (re.test(sample))
        throw new Error(`no-secrets pattern "${p.id}": example must NOT match but does: ${sample}`);
    return { id: p.id, description: p.description, re };
  });
  // Combined alternation gate: one linear pass; the per-pattern loop runs only on a hit. Every
  // pattern uses bounded quantifiers (ReDoS-safe), so the union stays linear. No flags/backrefs.
  const gate = new RegExp(db.patterns.map((p) => `(?:${p.regex})`).join("|"));
  return { patterns, gate, denylist: new Set(db.denylist ?? []) };
}

const DB = loadPatternDb();

export default defineRule({
  meta: {
    category: "security",
    description: "No hardcoded vendor secrets/credentials in string literals",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return;
      const value = node.text;
      if (DB.denylist.has(value)) return;
      if (!DB.gate.test(value)) return;
      for (const pattern of DB.patterns) {
        if (pattern.re.test(value)) {
          ctx.reportAt(
            node,
            `Hardcoded secret detected (${pattern.description}) — move it to an environment variable or secret store`,
            {
              action: "remove-hardcoded-secret",
              pattern: "Read from process.env / a secret manager; never commit the value",
              reference: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html",
            },
          );
          return;
        }
      }
    });
  },
});
