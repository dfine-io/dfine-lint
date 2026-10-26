# dlint Config and Shipping

## Contents

- DlintConfig - every key of `dlint.config.ts`
- Severity precedence - which setting wins, exit codes
- Groups - the built-in `opinionated` group and your own
- ruleOptions - change a value without copying a rule
- Rule packs - ship project rules as a `rulesDir`
- CLI - every flag
- Type-checking a rule pack

## DlintConfig

- Expect the bundled defaults to run when a project has no `dlint.config.ts`.
- Expect the bundled universal rules to load on their own - `rulesDir` adds the project's rules.
- Tune through `groups`, `ruleOptions` and `overrides` - never by copying a universal rule.

```typescript
import type { DlintConfig } from "@dfine-io-gmbh/dlint";

export default {
  bundledRules: true, // load the package's universal rules (default; false to opt out)
  rulesDir: ".dlint/rules", // project rules (a rule pack); same id overrides a bundled rule
  severity: "error", // global default severity
  include: ["**/*.ts", "**/*.tsx"], // files to scan, exclude's syntax; one pattern needs an extension
  exclude: ["node_modules", ".next", "build"], // also skipped: the root .gitignore and .dlintignore
  tsconfig: "./tsconfig.json",
  maxFileSize: 500_000,
  referencesDir: ".dlint/references",
  extractorsDir: ".dlint/extractors", // extractor definitions for --extract
  baseBranch: "origin/main", // what --branch diffs against (default)
  tags: ["db.select", "^audit.*$"], // calls --extract tags; a plain string matches exactly, ^...$ is a regex
  directive: "use server", // only functions in files with this directive are tagged
  groups: [{ id: "opinionated", severity: "error" }],
  ruleOptions: {
    "max-file-lines": { maxLines: 500 },
    "route-boundary": { appDir: "src/app", allowedPairs: [["checkout", "cart"]] },
  },
  overrides: [
    // per-rule severity, optionally file-scoped (files are path substrings, any severity)
    { ruleId: "no-magic-numbers", severity: "warning" },
    { ruleId: "complexity", severity: "warning", files: ["tests/"] },
    { ruleId: "unused-export", severity: "off", files: ["db/", "/route.ts"] },
    { ruleId: "react:nested-component", severity: "off", files: ["components/ui/"] }, // sub-check
  ],
} satisfies DlintConfig;
```

## Severity precedence

Applies to every finding - the first setting that applies wins.

1. A per-rule `override` - one whose `files` match beats a global one, the last match wins.
2. The rule's own `meta.severity` - it ignores its group, only an override turns it off.
3. The rule's `group`.
4. The global `severity`.

- Resolve a sub-check by its own `ruleId:subCheckId` override first.
- Expect a sub-check to fall back to `off` when its rule's override is `off`, then to its group.
- Expect it to fall back to its rule's severity last.
- Expect `opinionated` at `warning` to make its sub-checks warnings.
- Expect a rule override of another severity to leave its sub-checks to their group.
- Expect a rule to skip a sub-check via `ctx.isSubCheckDisabled(id)` when it resolves to `off`.
- Expect a finding that resolves to `off` to be dropped.
- Expect a rule to skip a file where it and every sub-check the config names are off.
- Name a rule in `overrides` or `groups` by its id or by its path below the rules dir.
- Expect a path such as `universal/no-local-constants` to map to its filename id.
- Expect `include` to leave a file named with `--files` alone, but to filter a named directory.
- Expect a full scan whose `include` matches no file to exit 2.

| Exit code | Meaning |
| --- | --- |
| `0` | no errors |
| `1` | errors found - dlint is a CI gate out of the box; `--no-error` reports without failing |
| `2` | a usage or config error, an unknown or disabled `--rules` id, or a file set that cannot resolve |

## Groups

- Expect a group to bundle rule ids and `ruleId:subCheckId` members under one severity.
- Expect one built-in group, `opinionated`, shipped `off` - 25 style or architecture rules.
- Expect it to hold 11 opinionated sub-checks as well.
- Expect their host rules: `performance`, `typescript`, `no-implicit-coercion`, `prefer-modern-api`.
- Expect a zero-config run to gate universal bugs and framework-guarded checks only.
- Turn the opinionated set on with one line - the first entry of the block below.
- Re-set a built-in group's severity with a user group of the same id.
- Expect a `rules` list on that same-id group to replace the built-in members, not add to them.
- Give a user group with a new id its own `rules` list - build your own concern bundles.

```typescript
groups: [
  { id: "opinionated", severity: "error" },
  { id: "soft", severity: "warning", rules: ["no-base-to-string", "exhaustive-switch"] },
];
```

## ruleOptions

Applies to every changed threshold, list or allow-set of an existing rule.

- Override a rule's `CONFIG` defaults by rule id - its logic stays in the package and updates.
- Spell the option key as the camelCase of the CONFIG const - `MAX_LINES` -> `maxLines`.
- Expect `CONSTANTS_DIR` -> `constantsDir` and `ALLOWED_PAIRS` -> `allowedPairs` the same way.
- Expect one exception in `safety`: its `ARRAY_CALLBACK_METHODS_REQUIRING_RETURN` key is shorter.
- Spell that one key `arrayCallbackMethods`.
- Never copy a universal rule into `rulesDir` to change a value - the copy freezes stale logic.
- Make a new rule's value tunable by reading `ctx.options.x ?? DEFAULT` - see `authoring.md`.
- Target one sub-check with a `ruleId:subCheckId` member in a group or an override.
- Pass that sub-check id to `reportAt` - only then the setting reaches its findings.

## Rule packs

Applies to project rules shipped as a `rulesDir` plus the `dlint.config.ts` that points at it.

- Expect every `.ts` file in `rulesDir` to become a rule - subdirs included, `.d.ts` skipped.
- Expect the id to be the filename alone - two same-named files in subdirs collide, the later wins.
- Expect a project rule with a bundled rule's id to override it - prefer `ruleOptions` instead.
- Expect no build step - the pack loads from source via jiti and ships as plain `.ts`.
- Keep each rule self-contained, importing only `typescript`, the SDK and Node built-ins.
- Import nothing from another rule - each one ships alone.
- Put every tunable in a `CONFIG` block read via `ctx.options`, and document each option key.
- Know why: consumers then share the pack without editing rule source.

## CLI

| Command or flag | Does |
| --- | --- |
| `npx dlint init` | scaffold `dlint.config.ts`, `.dlint/rules/` and `.dlint/tsconfig.json` |
| `npx dlint` | full project scan |
| `--changed` / `--commit` / `--branch` | uncommitted + untracked / last commit + uncommitted / all changes vs `baseBranch` |
| `--files <path...>` | lint specific files or directories |
| `--path <dir>` | project root; loads `<dir>/dlint.config.ts` and beats `--config` as the base |
| `--config <file>` | load this config; `rulesDir`, `tsconfig` and the scan base resolve relative to it |
| `--rules <id...>` | run only these rules; a rule a group resolves `off` does not load, and naming it exits 2 ("Rule(s) turned off in config") |
| `--format json\|table\|compact\|html` | default `json`; `html` writes a timestamped `.html` + `.json` pair to `.dlint/report/` and rejects `--fix` |
| `--no-error` | exit 0 even when errors are found |
| `--file-threshold <n>` | at `n`+ findings (default 300) the report goes to a temp file and stdout prints only `dlint: N errors, M warnings (...) -> <path>`; `0` turns it off |
| `--benchmark` | total, phase and per-rule timing - stderr, in json the `timings` field |
| `--extract` | extractor data as JSON, no linting |
| `--fix` (+ `--dry-run`) | apply only behaviour-keeping fixes, then lint again; the summary goes to stderr |
| `--list-rules` | the loaded rule set as JSON (id + description); no linting, no tsconfig needed |
| `--help` / `-h` | the full flag list with exit codes |

- Run `--fix` before `--format html` - html rejects the fix flag.
- Enable a rule's group or set an override before you name it in `--rules`.

## Type-checking a rule pack

- Type-check every rule pack - jiti strips types, so a type error becomes a silent wrong value.
- Extend the shipped `tsconfig.rules.json` - `dlint init` writes the pack side shown below.
- Run `npx tsc -p .dlint/tsconfig.json` to check the pack.
- Expect the shipped config to map `typescript` to the compiler dlint bundles.
- Know why: a project on a Go-native TypeScript 7.x package carries no types the rules could use.

```json
{ "extends": "@dfine-io-gmbh/dlint/tsconfig.rules.json", "include": ["rules/**/*.ts"] }
```
