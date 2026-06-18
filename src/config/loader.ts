import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { DlintConfig, RuleDefinition, ExtractorDefinition } from "../types.js";
import { resolveGroups } from "./groups.js";

const jiti = createJiti(import.meta.url, { interopDefault: true });

export async function loadConfig(projectPath: string, configFile?: string): Promise<DlintConfig> {
  const configPath = configFile ? resolve(configFile) : join(projectPath, "dlint.config.ts");
  if (!existsSync(configPath)) {
    throw new Error(`config not found: ${configPath}`);
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
): Promise<RuleDefinition[]> {
  const overrideMap = new Map<string, "error" | "warning" | "off">();
  for (const o of config.overrides ?? []) {
    if (o.files) continue; // File-scoped overrides handled in engine.ts
    overrideMap.set(o.ruleId, o.severity);
  }
  const defaultSeverity = config.severity ?? "error";
  // Group severities resolve below per-rule overrides and the rule's own meta.severity,
  // above the global default. The built-in "opinionated" group ships off (see groups.ts).
  const { ruleSeverity: groupRuleSeverity } = resolveGroups(config.groups);

  // Bundled universal rules ship with the package and load by default; project rules
  // (rulesDir) are additive and override a bundled rule with the same id.
  const dirs: string[] = [];
  if (config.bundledRules !== false) {
    const bundled = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dlint-rules", "universal");
    if (existsSync(bundled)) dirs.push(bundled);
  }
  if (config.rulesDir) {
    const projectDir = resolve(projectPath, config.rulesDir);
    if (existsSync(projectDir)) dirs.push(projectDir);
  }
  if (dirs.length === 0) {
    throw new Error("No rules found — enable bundledRules or set a valid rulesDir.");
  }

  const byId = new Map<string, RuleDefinition>();
  for (const dir of dirs) {
    for (const filePath of collectRuleFiles(dir)) {
      const mod = await jiti.import(filePath);
      const rule = (mod as { default: RuleDefinition }).default;
      if (!rule?.check || !rule?.meta) {
        throw new Error(`Invalid rule (missing check/meta): ${basename(filePath)}`);
      }
      rule.id = basename(filePath, ".ts");
      const baseName = filePath.replace(dir + "/", "").replace(/\.ts$/, "");
      const override = overrideMap.get(rule.id) ?? overrideMap.get(baseName);
      const resolved =
        override ?? rule.meta.severity ?? groupRuleSeverity.get(rule.id) ?? defaultSeverity;
      if (resolved === "off") { byId.delete(rule.id); continue; }
      rule.severity = resolved;
      byId.set(rule.id, rule);
    }
  }
  return [...byId.values()];
}

export async function loadExtractors(
  projectPath: string,
  config: DlintConfig
): Promise<ExtractorDefinition[]> {
  // Built-in extractors (always loaded)
  const { default: functionTags } = await import("../extractors/function-tags.js");
  const { default: complexityAnalysis } = await import("../extractors/complexity-analysis.js");
  const { default: domainDeclarations } = await import("../extractors/domain-declarations.js");
  const { default: functionConsumption } = await import("../extractors/function-consumption.js");
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
