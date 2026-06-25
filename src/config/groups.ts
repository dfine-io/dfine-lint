import type { RuleGroup, Severity } from "../types.js";

/**
 * Built-in rule groups shipped with the package.
 *
 * The "opinionated" group bundles every rule (and the few sub-checks) that encode a
 * style or architecture convention a generic TypeScript project may not share. It ships
 * `severity: "off"`, so a zero-config run only flags universal bugs and framework-guarded
 * issues — a clean CI gate. Consumers opt in with one line:
 *
 *   export default { groups: [{ id: "opinionated", severity: "error" }] } satisfies DlintConfig;
 *
 * Members are plain rule ids, or "ruleId:subCheckId" to target a single sub-check inside a
 * rule whose other sub-checks are universal (e.g. performance keeps regex-in-loop/sync-io on
 * while its long-chain/barrel-import opinions ship off).
 */
const BUILTIN_GROUPS: RuleGroup[] = [
  {
    id: "opinionated",
    severity: "off",
    rules: [
      // Whole rules: style / architecture conventions, not universal bugs.
      "any-propagation",
      "cache-caller-count",
      "complexity",
      "duplicate-import",
      "error-handling",
      "max-file-lines",
      "narrow-param-type",
      "no-duplicated-constants",
      "no-empty-function",
      "no-local-constants",
      "no-magic-numbers",
      "no-multiline-comments",
      "no-re-export",
      "no-underscore-prefix",
      "prefer-literal-union",
      "prefer-satisfies-over-as",
      "promise-all-opportunity",
      "readability",
      "route-boundary",
      "semantic-clone",
      "simplification",
      "syntactic-clone",
      "type-precision",
      "unbranded-type-consistency",
      "unused-export",
      // Sub-checks only: the host rule stays on (its other sub-checks are universal).
      "performance:long-chain",
      "performance:no-barrel-import",
      "typescript:no-explicit-any",
      "typescript:no-non-null-assertion",
      "typescript:no-inferrable-types",
      "typescript:null-check",
      "typescript:unsafe-index",
      "no-implicit-coercion:plus-coercion",
      "no-implicit-coercion:string-concat",
      "no-implicit-coercion:double-negation",
    ],
  },
];

/**
 * Merge the built-in groups with the user's config groups (a user entry overrides the
 * built-in severity by id; an absent `rules` keeps the built-in membership) and flatten
 * into per-rule severities and the set of globally-disabled sub-checks.
 */
export function resolveGroups(userGroups: readonly RuleGroup[] = []): {
  /** Effective severity per whole-rule group member (plain rule id). */
  ruleSeverity: Map<string, Severity | "off">;
  /** "ruleId:subCheckId" members whose effective group severity is "off". */
  disabledSubChecks: Set<string>;
} {
  const merged = new Map<string, RuleGroup>();
  for (const g of [...BUILTIN_GROUPS, ...userGroups]) {
    const prev = merged.get(g.id);
    merged.set(g.id, { id: g.id, severity: g.severity, rules: g.rules ?? prev?.rules ?? [] });
  }

  const ruleSeverity = new Map<string, Severity | "off">();
  const disabledSubChecks = new Set<string>();
  for (const g of merged.values()) {
    for (const member of g.rules ?? []) {
      if (member.includes(":")) {
        if (g.severity === "off") disabledSubChecks.add(member);
      } else {
        ruleSeverity.set(member, g.severity);
      }
    }
  }
  return { ruleSeverity, disabledSubChecks };
}
