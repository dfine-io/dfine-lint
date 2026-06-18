#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve, join, dirname } from "node:path";
import { lint } from "./core/engine.js";
import { loadConfig, loadRules } from "./config/loader.js";
import { formatTable } from "./formatters/table.js";
import { formatJson } from "./formatters/json.js";
import { formatCompact } from "./formatters/compact.js";
import type { CliOptions } from "./types.js";

// Any uncaught error (a malformed tsconfig surfaced by program creation, a rule that throws, etc.)
// becomes a one-line `dlint:` message with the config-error exit code — never a raw stack trace.
// The explicit try/catch blocks below still handle known usage/config errors first with tailored text.
function die(err: unknown): never {
  process.stderr.write(`dlint: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
process.on("uncaughtException", die);
process.on("unhandledRejection", die);

// ============================================================================
// dlint init — scaffold .dlint/rules + dlint.config.ts
// ============================================================================

if (process.argv[2] === "init") {
  const projectPath = resolve(process.cwd());

  // Universal rules load from the package at runtime — only project-specific rules live in .dlint/rules.
  mkdirSync(join(projectPath, ".dlint", "rules"), { recursive: true });

  const configPath = join(projectPath, "dlint.config.ts");
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      `import type { DlintConfig } from "@dfine-io-gmbh/dlint";

export default {
  rulesDir: ".dlint/rules",
  severity: "error",
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules", ".next", "build"],
  tsconfig: "./tsconfig.json",
} satisfies DlintConfig;
`,
    );
    console.log("dlint: created dlint.config.ts");
  }

  console.log(
    "dlint: ready — universal rules load from the package; add project rules in .dlint/rules/",
  );
  process.exit(0);
}

function printUsage(): void {
  process.stdout
    .write(`dlint — semantic TypeScript linter on the TS Compiler API

Usage:
  dlint [options]               Lint (default: full project scan)
  dlint init                    Scaffold .dlint/rules + dlint.config.ts
  dlint --help, -h              Show this help

Scan modes (default: full project):
  --files <path...>             Lint specific files or directories
  --changed                     Uncommitted + untracked files
  --commit                      Last commit + uncommitted changes
  --branch                      All changes vs base branch (config.baseBranch, default origin/main)

Config & target:
  --config <file>               Load this config; rulesDir + tsconfig resolve from its directory,
                                so one rule set lints app + workers + packages from any cwd
  --path <dir>                  Project root — loads <dir>/dlint.config.ts (default: cwd)
  --rules <id...>               Only run these rule ids

Output:
  --format <fmt>                json (default) | table | compact | html
  --benchmark                   Show per-rule timing (table format)
  --file-threshold <n>          Write report to /tmp when findings >= n (default 300)
  --no-error                    Exit 0 even when errors are found

Autofix:
  --fix                         Apply available autofixes
  --dry-run                     With --fix: show what would change, write nothing

Analysis:
  --extract                     Output extractor data as JSON (no linting)

Exit codes: 0 = clean · 1 = findings · 2 = usage/config error
`);
}

if (
  process.argv.includes("--help") ||
  process.argv.includes("-h") ||
  process.argv[2] === "help"
) {
  printUsage();
  process.exit(0);
}

/** Collect all non-flag args after a --flag until the next --flag */
function collectValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  let collecting = false;
  for (const arg of argv) {
    if (arg === flag) {
      collecting = true;
      continue;
    }
    if (arg.startsWith("--")) {
      collecting = false;
      continue;
    }
    if (collecting) values.push(arg);
  }
  return values;
}

// Pre-collect --rules and --files as space-separated values
const rulesArg = collectValues(process.argv, "--rules");
const filesArg = collectValues(process.argv, "--files");

const { values } = (() => {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        path: { type: "string", default: process.cwd() },
        rules: { type: "string", multiple: true, default: [] },
        files: { type: "string", multiple: true, default: [] },
        config: { type: "string" },
        changed: { type: "boolean", default: false },
        commit: { type: "boolean", default: false },
        branch: { type: "boolean", default: false },
        format: { type: "string", default: "json" },
        "no-error": { type: "boolean", default: false },
        benchmark: { type: "boolean", default: false },
        "file-threshold": { type: "string", default: "300" },
        fix: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        extract: { type: "boolean", default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`dlint: ${(err as Error).message.split("\n")[0]}\n\n`);
    printUsage();
    process.exit(2);
  }
})();

// --config <file>: paths (rulesDir, tsconfig) resolve relative to the config's directory, not the
// cwd — so the same config runs from anywhere. Explicit --path still wins as the resolution base.
const pathExplicit = process.argv.includes("--path");
const configFile = values.config ? resolve(values.config) : undefined;

let resolvedPath: string;
if (pathExplicit) resolvedPath = resolve(values.path ?? process.cwd());
else if (configFile) resolvedPath = dirname(configFile);
else resolvedPath = resolve(process.cwd());

const opts = {
  path: resolvedPath,
  configPath: configFile,
  rules: rulesArg.length > 0 ? rulesArg : (values.rules ?? []),
  files: filesArg.length > 0 ? filesArg : (values.files ?? []),
  changed: values.changed ?? false,
  commit: values.commit ?? false,
  branch: values.branch ?? false,
  format: (values.format ?? "json") as CliOptions["format"],
  noError: values["no-error"] ?? false,
  benchmark: values.benchmark ?? false,
  fileThreshold: Number(values["file-threshold"] ?? 300),
  fix: values.fix ?? false,
  dryRun: values["dry-run"] ?? false,
  extract: values.extract ?? false,
} satisfies CliOptions;

// Validate format
const validFormats = new Set(["table", "json", "compact", "html"]);
if (!validFormats.has(opts.format)) {
  console.error(
    `Error: Invalid format "${opts.format}".\nUsage: --format <table|json|compact|html>`,
  );
  process.exit(2);
}

const { config, rules } = await (async () => {
  try {
    const config = await loadConfig(opts.path, opts.configPath);
    const rules = await loadRules(opts.path, config);
    return { config, rules };
  } catch (err) {
    process.stderr.write(`dlint: ${(err as Error).message}\n`);
    process.exit(2);
  }
})();

// Validate rule IDs
if (opts.rules.length > 0) {
  const ruleIds = new Set(rules.map((r) => r.id));
  const unknown = opts.rules.filter((r) => !ruleIds.has(r));
  if (unknown.length > 0) {
    console.error(
      `Error: Unknown rule(s): ${unknown.join(", ")}.\nAvailable: ${[...ruleIds].sort().join(", ")}`,
    );
    process.exit(2);
  }
}

if (opts.format === "html") {
  const { loadExtractors } = await import("./config/loader.js");
  const { extract } = await import("./core/extractor.js");
  const { formatHtml } = await import("./formatters/html.js");
  const extractors = await loadExtractors(opts.path, config);
  const extractResult = extract(opts, extractors, config);
  const lintResult = lint(opts, rules, config);
  const { html, data } = formatHtml(
    lintResult,
    extractResult,
    rules,
    opts,
    extractors,
  );
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(2);
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const projectName = opts.path.split("/").pop() ?? "dlint";
  const baseName = `${dd}${mm}${yy}_${hh}h${min}_${projectName}_dlint-report`;
  const reportDir = join(opts.path, ".dlint", "report");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, `${baseName}.html`), html);
  writeFileSync(
    join(reportDir, `${baseName}.json`),
    JSON.stringify(data, null, 2),
  );
  process.stdout.write(
    `dlint: report generated → .dlint/report/${baseName}.html\n`,
  );
  process.exit(0);
}

if (opts.extract) {
  const { loadExtractors } = await import("./config/loader.js");
  const { extract } = await import("./core/extractor.js");
  const extractors = await loadExtractors(opts.path, config);
  const extractResult = extract(opts, extractors, config);
  process.stdout.write(JSON.stringify(extractResult, null, 2) + "\n");
  process.exit(0);
}

const result = lint(opts, rules, config);

if (opts.fix && result.fixableCount > 0) {
  const { applyFixes } = await import("./core/fixer.js");
  const fixResults = applyFixes(result.diagnostics, opts.path, opts.dryRun);
  const totalApplied = fixResults.reduce((s, r) => s + r.applied, 0);
  const totalSkipped = fixResults.reduce((s, r) => s + r.skipped, 0);
  const verb = opts.dryRun ? "would fix" : "fixed";
  process.stdout.write(
    `dlint --fix: ${verb} ${totalApplied} issues in ${fixResults.length} files` +
      `${totalSkipped > 0 ? ` (${totalSkipped} skipped — overlap)` : ""}\n`,
  );
  if (opts.dryRun) {
    for (const r of fixResults) {
      process.stdout.write(`  ${r.file}: ${r.applied} fixes\n`);
    }
  }
}

const fmt = { table: formatTable, json: formatJson, compact: formatCompact };
const output = fmt[opts.format](result, opts);
const totalDiagnostics = result.errorCount + result.warningCount;

if (opts.fileThreshold > 0 && totalDiagnostics >= opts.fileThreshold) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = `/tmp/dlint-${timestamp}.json`;
  writeFileSync(filePath, output);
  process.stdout.write(
    `dlint: ${result.errorCount} errors, ${result.warningCount} warnings ` +
      `(${result.fileCount} files, ${result.ruleCount} rules, ${result.checkCount} checks) ` +
      `→ ${filePath}\n`,
  );
} else {
  process.stdout.write(output);
}

// Non-invasive upgrade nudge (stderr, human formats only): the opinionated rules ship off, so a
// config that never sets `groups` silently runs fewer rules. Stays silent once the user opts in.
if (
  (opts.format === "compact" || opts.format === "table") &&
  !config.groups?.length
) {
  process.stderr.write(
    `dlint: 'opinionated' rules are off by default - enable them with ` +
      `groups: [{ id: "opinionated", severity: "error" }] (see README)\n`,
  );
}

if (!opts.noError && result.errorCount > 0) {
  process.exit(1);
}
