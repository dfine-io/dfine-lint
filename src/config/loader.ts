import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createJiti } from "jiti";
import { BUNDLED_RULES_DIR, PACKAGE_ROOT } from "../core/constants.js";
import type { DlintConfig, RuleDefinition, ExtractorDefinition, SkippedRule } from "../types.js";
import { severityPolicy, type SeverityPolicy } from "./severity.js";

// Consumer project rules (.dlint/rules/*.ts) are jiti-loaded from the CONSUMER's directory, so their bare
// `import ts from "typescript"` would resolve the consumer's typescript — on a TS7-native project that package
// has no in-process JS-API (SyntaxKind/isX/createSourceFile are undefined) → the rule crashes on load and takes
// the whole run with it. Alias `typescript` to dlint's own bundled 6.x engine so EVERY jiti-loaded rule (bundled
// AND consumer) resolves the JS-API compiler deterministically — this is the isolation the TS7 interim promises.
// The SDK import is pinned the same way: another install would judge lib files by its own TypeScript's directory.
const require = createRequire(import.meta.url);
const alias = { typescript: require.resolve("typescript"), "@dfine-io-gmbh/dlint": PACKAGE_ROOT };
const jiti = createJiti(import.meta.url, { interopDefault: true, alias });
// Bundled rules default-import only typescript, so they skip the interop proxy and its getter on every ts.* access
const bundledJiti = createJiti(import.meta.url, { interopDefault: false, alias });

export async function loadConfig(projectPath: string, configFile?: string): Promise<DlintConfig> {
  const configPath = configFile ? resolve(configFile) : join(projectPath, "dlint.config.ts");
  if (!existsSync(configPath)) {
    // An explicit --config must exist; without one the bundled defaults apply
    if (configFile) throw new Error(`config not found: ${configPath}`);
    process.stderr.write(`dlint: no dlint.config.ts in ${projectPath}, running the bundled defaults\n`);
    return {};
  }
  const mod = await jiti.import(configPath);
  return (mod as { default: DlintConfig }).default ?? (mod as DlintConfig);
}

/** Recursively collect all .ts files from a directory */
function collectRuleFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectRuleFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

export async function loadRules(
  projectPath: string,
  config: DlintConfig
): Promise<{ rules: RuleDefinition[]; skipped: SkippedRule[]; disabled: string[]; severity: SeverityPolicy }> {
  // Bundled universal rules ship with the package and load by default; project rules
  // (rulesDir) are additive and override a bundled rule with the same id.
  const dirs: string[] = [];
  if (config.bundledRules !== false && existsSync(BUNDLED_RULES_DIR)) dirs.push(BUNDLED_RULES_DIR);
  if (config.rulesDir) {
    const projectDir = resolve(projectPath, config.rulesDir);
    if (existsSync(projectDir) && !dirs.includes(projectDir)) dirs.push(projectDir);
  }
  if (dirs.length === 0) {
    throw new Error("No rules found — enable bundledRules or set a valid rulesDir.");
  }

  // A broken rule file is skipped and reported, never fatal: one malformed project rule must not
  // take down a whole run. Bundled rules ship validated, so in practice this only hits rulesDir.
  const byId = new Map<string, RuleDefinition>();
  const skipped: SkippedRule[] = [];
  const aliases = new Map<string, string>();
  for (const dir of dirs) {
    for (const filePath of collectRuleFiles(dir)) {
      let rule: RuleDefinition | undefined;
      try {
        const mod = await (dir === BUNDLED_RULES_DIR ? bundledJiti : jiti).import(filePath);
        rule = (mod as { default: RuleDefinition }).default;
      } catch (err) {
        const first = (err as Error).message.split("\n")[0];
        skipped.push({ file: basename(filePath), reason: first ?? "failed to load" });
        continue;
      }
      if (!rule?.check || !rule?.meta) {
        skipped.push({ file: basename(filePath), reason: "missing check/meta" });
        continue;
      }
      // meta.description is required by the type, but jiti strips types, so check it at load time.
      if (typeof rule.meta.description !== "string" || !rule.meta.description.trim()) {
        skipped.push({ file: basename(filePath), reason: "missing meta.description" });
        continue;
      }
      rule.id = basename(filePath, ".ts");
      aliases.set(filePath.replace(dir + "/", "").replace(/\.ts$/, ""), rule.id);
      byId.set(rule.id, rule);
    }
  }
  // A rule stays loaded while any setting turns it, or one of its sub-checks, on for some file
  const severity = severityPolicy(config, aliases);
  const rules = [...byId.values()].filter(severity.everEnabled);
  const loadedIds = new Set(rules.map((r) => r.id));
  return { rules, skipped, disabled: [...byId.keys()].filter((id) => !loadedIds.has(id)), severity };
}

export async function loadExtractors(
  projectPath: string,
  config: DlintConfig
): Promise<ExtractorDefinition[]> {
  // Built-in extractors (always loaded)
  const [{ default: functionTags }, { default: complexityAnalysis }, { default: domainDeclarations }, { default: functionConsumption }] = await Promise.all([
    import("../extractors/function-tags.js"),
    import("../extractors/complexity-analysis.js"),
    import("../extractors/domain-declarations.js"),
    import("../extractors/function-consumption.js"),
  ]);
  const builtIn: ExtractorDefinition[] = [functionTags, complexityAnalysis, domainDeclarations, functionConsumption];
  const builtInIds = new Set(builtIn.map((e) => e.id));

  // Project extractors (additive, can override built-in by ID)
  const dir = resolve(projectPath, config.extractorsDir ?? ".dlint/extractors");
  if (!existsSync(dir)) return builtIn;

  const filePaths = collectRuleFiles(dir);
  const projectExtractors: ExtractorDefinition[] = [];

  for (const filePath of filePaths) {
    const mod = await jiti.import(filePath);
    const def = (mod as { default: ExtractorDefinition }).default;
    if (!def?.id || !def?.extract) {
      const relPath = filePath.replace(dir + "/", "");
      throw new Error(`Invalid extractor (missing id/extract): ${relPath}`);
    }
    projectExtractors.push(def);
    // Project extractor overrides built-in with same ID
    if (builtInIds.has(def.id)) builtInIds.delete(def.id);
  }

  return [...builtIn.filter((e) => builtInIds.has(e.id)), ...projectExtractors];
}
