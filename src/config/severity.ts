import type { DlintConfig, RuleDefinition, Severity } from "../types.js";
import { resolveGroups } from "./groups.js";

type Setting = Severity | "off";

export interface SeverityPolicy {
  // The severity of a rule's finding, or of one of its sub-checks, in one file or (no file) globally
  of: (rule: RuleDefinition, subCheck?: string, file?: string) => Setting;
  // Whether the rule, or a sub-check the config names, is on in this file (or, without a file, globally)
  runsIn: (rule: RuleDefinition, file?: string) => boolean;
  // Whether any setting turns the rule, or one of its sub-checks, on in at least one file
  everEnabled: (rule: RuleDefinition) => boolean;
}

// An id with its rule part as the rule's id: a rule in a rulesDir subfolder is also named by its path there
function canonicalId(id: string, aliases: ReadonlyMap<string, string>): string {
  const [rule = "", sub] = id.split(":");
  const canonical = aliases.get(rule) ?? rule;
  return sub === undefined ? canonical : `${canonical}:${sub}`;
}

// A rule takes its override (one whose files, path substrings, match the path before a global one; the last matching
// entry wins), else its own meta.severity, its group, the default. A sub-check takes its own override, else `off` when
// its rule's override is off, else its group, else its rule's severity: a rule override of another severity leaves a
// sub-check its group names alone. aliases maps a rule's path in rulesDir to its id.
export function severityPolicy(config: DlintConfig, aliases: ReadonlyMap<string, string>): SeverityPolicy {
  const overrides = (config.overrides ?? []).map((o) => ({ ...o, ruleId: canonicalId(o.ruleId, aliases) })).reverse();
  const groups = new Map([...resolveGroups(config.groups)].map(([id, s]) => [canonicalId(id, aliases), s]));
  const fallback = config.severity ?? "error";
  const scopedOverrides = overrides.filter((o) => o.files !== undefined);
  const scoped = (id: string, file: string | undefined): Setting | undefined =>
    file === undefined ? undefined : scopedOverrides.find((o) => o.ruleId === id && o.files?.some((f) => file.includes(f)))?.severity;
  // Lookups run per file and rule, so the global entries and each rule's sub-check list are built once
  const globals = new Map<string, Setting>();
  for (const o of overrides) if (o.files === undefined && !globals.has(o.ruleId)) globals.set(o.ruleId, o.severity);
  const override = (id: string, file: string | undefined): Setting | undefined => scoped(id, file) ?? globals.get(id);
  const named = [...overrides.map((o) => o.ruleId), ...groups.keys()];
  const subCheckLists = new Map<string, readonly string[]>();
  // The sub-checks the config names for a rule: only these can differ from the rule's own severity
  const subChecks = (ruleId: string): readonly string[] => {
    let list = subCheckLists.get(ruleId);
    if (!list) {
      list = [...new Set(named.filter((id) => id.startsWith(`${ruleId}:`)).map((id) => id.slice(ruleId.length + 1)))];
      subCheckLists.set(ruleId, list);
    }
    return list;
  };
  const of = (rule: RuleDefinition, subCheck?: string, file?: string): Setting => {
    const ruleOverride = override(rule.id, file);
    const ruleLevel = ruleOverride ?? rule.meta.severity ?? groups.get(rule.id) ?? fallback;
    if (subCheck === undefined) return ruleLevel;
    const sub = `${rule.id}:${subCheck}`;
    return override(sub, file) ?? (ruleOverride === "off" ? "off" : undefined) ?? groups.get(sub) ?? ruleLevel;
  };
  const runsIn = (rule: RuleDefinition, file?: string): boolean =>
    [undefined, ...subChecks(rule.id)].some((sub) => of(rule, sub, file) !== "off");
  // A file-scoped entry can turn on what is off everywhere else
  const everEnabled = (rule: RuleDefinition): boolean => runsIn(rule) ||
    overrides.some((o) => !!o.files?.length && o.severity !== "off" && (o.ruleId === rule.id || o.ruleId.startsWith(`${rule.id}:`)));
  return { of, runsIn, everEnabled };
}
