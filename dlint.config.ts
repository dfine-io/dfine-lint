import type { DlintConfig } from "@dfine-io-gmbh/dlint";

// dlint linting itself: the bundled universal rules over the SDK's own src/.
export default {
  severity: "error",
  // dlint shares its own conventions, so it opts the opinionated group ON for self-lint;
  // the per-rule overrides below still win where a rule does not fit this tooling code.
  groups: [{ id: "opinionated", severity: "error" }],
  include: ["**/*.ts"],
  exclude: [
    "node_modules",
    "build",
    "tests",
    "dlint-rules",
    "assets",
    ".dlint",
  ],
  tsconfig: "./tsconfig.json",
  overrides: [
    // index.ts files are public API barrels — re-exports are intentional there
    { ruleId: "no-re-export", severity: "off", files: ["index.ts"] },
    // no-multiline-comments is a downstream style convention, not the SDK's own
    { ruleId: "no-multiline-comments", severity: "off" },
    // tooling code has inherent magic numbers (SyntaxKind values, byte/size math, thresholds)
    { ruleId: "no-magic-numbers", severity: "off" },
    // core/constants.ts already centralizes module constants — no constants/ dir convention here
    { ruleId: "no-local-constants", severity: "off" },
    // string-concat vs template-literal is acceptable in this tooling/template code
    { ruleId: "syntax", severity: "off" },
    // html-template.ts is a single-file string template, cli.ts is a linear arg-parse/help/dispatch
    // entrypoint — the per-file line cap does not meaningfully apply to either
    { ruleId: "max-file-lines", severity: "off", files: ["html-template.ts", "cli.ts"] },
    // a linter's own rule ids are plain strings — branding them is over-engineering
    { ruleId: "unbranded-type-consistency", severity: "off" },
    // argv/parsed-token comparisons are external strings — not narrowable to a literal union
    { ruleId: "prefer-literal-union", severity: "off" },
    // define-rule's temp `rule` var is load-bearing (self-reference rule.id in the closure)
    { ruleId: "simplification", severity: "off", files: ["define-rule.ts"] },
    // string-builders use local accumulator arrays inside .map() and loop-built RegExps (from the
    // loop var) — not the outer-mutation / hoistable patterns this rule targets
    { ruleId: "performance", severity: "off" },
    // loader validates jiti-loaded modules at runtime; the `as` cast makes the guard look dead
    { ruleId: "logic", severity: "off" },
    // AST traversal + report builders are inherently branchy; threshold overage is marginal here
    { ruleId: "complexity", severity: "off" },
    // the formatters share a uniform (result, opts) dispatch signature on purpose
    { ruleId: "narrow-param-type", severity: "off" },
    // cli `values` destructure + guarded TOKEN_MAP index access are type-safe as written
    { ruleId: "typescript", severity: "off" },
    // dlint's own file/rule discovery walks directories (readdirSync) by design — the path is
    // dlint's configured scan root, not external runtime input, so this is not the traversal sink
    // the rule targets. (scanner.ts shells out via execFile, not exec, so no-child-process is clean.)
    {
      ruleId: "no-non-literal-fs-path",
      severity: "off",
      files: ["scanner.ts", "loader.ts"],
    },
  ],
} satisfies DlintConfig;
