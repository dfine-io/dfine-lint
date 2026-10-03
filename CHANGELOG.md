# Changelog

## 1.5.4

### Changed

- **dlint stops with exit code 2 when it cannot know the file set.** A missing or unreadable
  `tsconfig`, invalid JSON, a broken `extends`, or a config that includes no files now ends the
  run with a `dlint:` message, and so does a failing git call: no repository (every mode except
  `--files` lists files through git), a `--branch` base that is not fetched, a base branch that
  starts with `-` or contains `..`, or a shallow clone for `--commit`. Before, these printed
  "0 errors" and exited 0, so a CI gate passed without checking anything. The `tsconfig`,
  configured or the default `tsconfig.json`, resolves against the project directory only and never
  falls back to a parent directory. An error inside `compilerOptions`, such as an option only
  TypeScript 7 knows, prints a warning on stderr and the run continues.
- **The file count shows the files that were linted.** Scanned files outside the tsconfig's
  program are no longer counted. A missing `--files` entry stops a lint run and `--extract` with
  exit code 2 (it was 1).
- **`--rules <id>` names a rule the config turns off.** It used to call that rule unknown.
- **Upgrading can surface new findings.** Several fixes below widen detection (`this.db`
  receivers, export lists, library hooks, control flow in clone detection, deprecated lib members,
  arguments and receivers, `this` chains, re-exports, `import D, { type T }`, package types in
  template literals, parameters written through destructuring, values read through a shorthand
  `{ x }`, template literal types and literal unions as strings, two `import type` lines from one
  module), so a codebase that was clean on 1.5.3 can report findings on 1.5.4. Others narrow it:
  `.at()`, `.startsWith()` and `Object.hasOwn()` are only suggested where the type or lib has them,
  a self-import is reported once, `logic` no longer calls `a.ok` and `b.ok` the same condition, and
  two constants that hold the same literal are no self-compare.
- **Clone detection is faster.** Both clone rules share one tokenization per file and reuse each
  bigram set.
- **The bundled rules run faster.** They load without jiti's interop layer, and the rules that
  read imports share one module resolution cache per program. On a 1,778-file project with the 61
  default rules, a full run went from 37.0 s to 16.5 s.
- **`--fix` applies only fixes that keep behavior, then reports what is left.** These fixes are
  now report-only: `no-floating-promises` (`await`), `prefer-nullish-coalescing` (`??`),
  `prefer-optional-chain` (`?.`), `no-implicit-coercion` (`===`, `Number(x)`, `String(x)`),
  `no-base-to-string` (`JSON.stringify`), `exhaustive-deps` (added dependencies),
  `exhaustive-switch` (`default` clause), `unused-export` (removed `export`), `missing-returning`
  (`.returning()`), `prefer-satisfies-over-as` and `type-precision` (`satisfies`, `Pick`,
  `readonly`), `typescript` (`unknown` catch variable, `new Error()` around a thrown string, type
  alias for an empty interface), `await-non-thenable` (removed `await`), `prefer-modern-api`
  (`.includes()`), `safety` (radix), `error-handling` (`{ cause }`), `no-deprecated-api`
  (`Object.getPrototypeOf()`) and `restrict-template-expr` (`String()`, which still printed
  `[object Object]` and only hid the finding). After fixing, dlint lints the same files a second
  time, so the output and the exit code describe what is left. The fix summary goes to stderr, so
  `--fix --format json` prints valid JSON below `--file-threshold`.
- **No config file is needed.** Without a `dlint.config.ts` the bundled defaults apply and dlint
  says so on stderr. A `--config` that points nowhere still exits 2.
- **`--format html` exits 1 when errors are found**, like the other formats (`--no-error` still
  exits 0). `--fix` together with `--format html` is rejected.
- **`--file-threshold` writes into a fresh temp directory**, as `report.json` for `--format json`
  and `report.txt` for the other formats.
- **`maxFileSize` applies to every git mode.** `--changed`, `--commit` and `--branch` skip
  oversized files like the full scan does; a path named with `--files`, file or directory, is
  never size-filtered.
- **`restrict-template-expr` reports package types too, and skips tags that build no string.** A
  type from `node_modules` without its own `toString()` prints `[object Object]` in a template
  literal, and `no-base-to-string` already reported it in a string concatenation. A tagged template
  such as Drizzle's ``sql`...` `` hands its values to the tag, so nothing is stringified there; a tag
  that returns a string, such as `String.raw`, is still checked.
- **`self-import` owns a file that imports itself.** `no-import-cycle` no longer reports that
  case a second time, and `self-import` now also catches `export … from` the file itself.
- **`deprecated-usage` treats TypeScript's lib like any other code.** A deprecated lib member is
  reported when it is read, not only when it is called, and an identifier passed as an argument or
  used as a receiver is checked too. A reference counts as deprecated only when every declaration
  of its symbol is.

### Added

- **`dbRootMethod` in the SDK.** It returns the method called on the DB handle of a call chain,
  or `null`. `isDbCall` is built on it.
- **`ExportedFunction.func`.** The function node of an exported function: the declaration itself,
  or the arrow or function expression a `const` holds.
- **`--benchmark` shows where the time goes.** It prints the total, the phases (file scan,
  program, type checking, reference index, rules, cache) and every rule, slowest first, on stderr;
  `--format json` adds them as a `timings` field. The checker runs up front in that mode, so a
  `--benchmark` run takes longer than a plain one.
- **SDK helpers for imports, writes, strings and thenables.** `resolveImportedModule` resolves an
  import specifier the way the program does, with one cache per program, and `collectValueImports`
  lists the specifiers a file loads at runtime. `isTypeOnlyImport`, `isWriteTarget`,
  `valueSymbolOf`, `isSameReference`, `isStringType` and `isThenable` replace copies that disagreed
  between rules.

### Fixed

- **`type-precision` no longer flags parameters that are already readonly.** The prefer-readonly
  check looked only at the type as written, so a parameter typed through an alias of a readonly array
  (`type KeyPath = readonly string[]`) or as `Readonly<string[]>` was reported as a mutable `T[]`. The
  check now reads the type the compiler resolves, which covers nested and generic aliases as well as
  `Readonly<T[]>`. An alias of a mutable array is still reported.
- **The DB rules see `this.db` and `ctx.db`.** `isDbCall` only accepted a bare identifier as the
  receiver, so `no-dynamic-sql`, `no-db-antipatterns` and `missing-returning` missed calls such as
  `this.db.execute(...)`. A query builder returned by a call, such as Supabase's `from()`, still
  does not count as a DB handle.
- **Directive checks read the whole prologue, and export lists count as exports.** `hasDirective`
  read only the first statement, so `"use strict"; "use server"` hid a file from every rule that
  checks a directive. `getExportedFunctions` missed `export { a, b as c }` lists of functions
  declared in the same file. Re-exports from another module stay outside its scope.
- **Package checks compare the package name.** `isFromPackage` matched any path containing
  `/<name>/`, so a project folder named `react/` counted as React. `rules-of-hooks` now treats
  every `use*` function from `node_modules` as a hook, which covers library hooks such as
  zustand's `useStore`. A React call without the `use` prefix, such as `createElement`, no longer
  marks a function as a component or hook.
- **Loop checks skip code that runs once.** `isInsideLoop` counted the iterable of a
  `for...of`/`for...in` and the initializer of a `for` as part of the loop.
- **Clone detection sees control flow.** The tokenizer never emitted `if`, `for`, `return`,
  `const` and similar tokens, so functions with different control flow could score as clones. Two
  bodies without any tokens no longer count as a 100% match.
- **Generic values count as nullable through their constraint.** `prefer-nullish-coalescing` now
  flags `x || d` when `x` is a type parameter whose constraint includes `null` or `undefined`, and
  still skips a `boolean` constraint. `state-hooks-cluster` treats such generic state as nullable
  too.
- **Smaller SDK fixes.** A read-only `node_modules` no longer aborts the run, since the cache is
  optional. `resolveCallBody` finds the body of an overloaded function. `isBuiltinCollection`
  accepts `ReadonlyMap` and `ReadonlySet`, so `narrow-param-type` no longer suggests narrowing such
  parameters. `isLibDeclaration` checks TypeScript's lib files instead of the file name, so a
  project file named `lib.*.d.ts` no longer counts as a built-in. `isInConditionalBranch` detects
  `if`/`else` branches and skips the ternary condition. `no-non-literal-require` identifies Node's
  `require` through `isFromPackage`.
- **Extractors.** `function-tags` no longer crashes on an exported arrow function.
  `complexity-analysis` no longer counts that arrow as its own helper and reports its real
  parameter count. `function-consumption` reports every function of a multi-declarator
  `export const`.
- **Git modes see every changed file.** A config in a subdirectory gets the files git reports for
  that directory, file names with quotes, spaces or non-ASCII characters are no longer dropped,
  `--changed` before the first commit lints the staged files, and `--commit` on a root commit
  lints the commit's own files.
- **Autofixes produce valid code.** A removed statement takes its whole line, and one that was the
  only body of an `if` or loop becomes `{}`. A fix with several edits lands whole or not at all.
  Fixes land in the right place in a file that starts with a byte order mark, and `--fix` never
  writes through a symlink that leads out of the project. `let` no longer becomes `const` when
  the variable is written through destructuring or a `for...of` head. `.at()` is only suggested
  where the receiver's type has it and the element is read, `.startsWith()` only for strings,
  `Object.hasOwn()` only where the lib declares it, and `.flatMap()` keeps the `thisArg`. A
  self-import that binds names, a property self-assignment, a constructor that passes arguments to
  `super`, an unreachable declaration and a `__proto__` key are left alone.
- **Rules that read imports agree.** `duplicate-import`, `no-import-cycle`,
  `no-client-server-only-import` and `unnecessary-use-server` share one notion of a type-only
  import, so `import D, { type T }` counts as a value import everywhere. Under
  `verbatimModuleSyntax` only `import type` and `export type` count as erased; otherwise an import
  with only `type` specifiers or empty braces does. `unnecessary-use-server` follows `export … from`
  re-exports through a barrel, `no-client-server-only-import` and `route-boundary` check them, and
  `performance` no longer reports an `import type` from a barrel. An `import type` next to two value
  imports of one module no longer hides that `duplicate-import` duplicate.
- **Smaller rule fixes.** `deprecated-usage` no longer reports a deprecated function that calls
  itself. `simplification` no longer reports a private or protected empty constructor.
  `prefer-const` in `syntax` no longer counts `!x` or `-x` as a write. `no-useless-code` no longer
  flags `["__proto__"]` in an object literal or `["constructor"]` in a class.
  `prefer-optional-chain` now also matches `this.a && this.a.b`. `no-implicit-coercion` finds `!!x`
  inside `&&`/`||` chains and `for` conditions.
- **Every form of a write counts.** `correctness` catches a parameter written through
  destructuring or a `for...of` head, and reads `{ a = p }` as a read of `p`. `banned-syntax`
  reports `NaN += 1`, `NaN++` and a destructuring write to a global, not only `NaN = 1`, and
  reports `delete (x)` like `delete x`. `safety` no longer counts `x === y` or `!x` as changing a
  loop condition and does count a destructuring write.
- **A shorthand `{ x }` reads the variable `x`.** `exhaustive-deps` now asks for a dependency read
  only that way, `react` accepts `setForm({ value })` in an effect on `[value]`,
  `deprecated-usage` reports a deprecated variable used that way, and `logic` keeps
  `x = wrap({ x })`.
- **Rules agree on what is the same.** `logic` compares conditions by receiver as well as
  property, element access included, treats `a[0]` and `a["0"]` as one element, and no longer
  calls a write dead when the next write reads the array (`a[0] = v; a[0] = a.reduce(...)`).
  `correctness` catches `this.x = this.x`, sees through parentheses (`x === (x)`) and compares by
  value only what is written as a literal, so two constants holding `3` are no self-compare.
- **String types count as strings.** Template literal types, `Uppercase<string>` and literal unions
  are strings in `no-base-to-string`, `no-implicit-coercion`, `restrict-plus-operands`, `syntax`
  (prefer-template), `typescript` (throw-string), `no-implied-eval`, `no-collection-size-mischeck`
  and `restrict-template-expr` (a tag returning one).

## 1.5.3

### Added

- **A shipped `tsconfig.rules.json` for type-checking project rules.** Rules load through jiti,
  which strips types, so an unchecked type error in a rule never crashes — it becomes a silent wrong
  value. A rule pack now extends the shipped config instead of hand-rolling one:
  `{ "extends": "@dfine-io-gmbh/dlint/tsconfig.rules.json", "include": ["rules/**/*.ts"] }`, then
  `npx tsc -p .dlint/tsconfig.json`. It maps `typescript` to the compiler dlint bundles, so rules are
  checked against the engine that runs them. That is what makes it work when the project builds with
  a different TypeScript, such as the Go-native 7.x, whose package carries no types to check against.
- **`dlint init` writes `.dlint/tsconfig.json`.** Existing files are left untouched.
- **`package.json` is exported.** Tooling can read the installed version again; the previous
  `exports` map rejected the subpath.

## 1.5.2

### Added

- **`dlint --list-rules` prints the loaded rule set as JSON.** One entry per active rule with its
  id and a one-line description (max 120 characters), sorted by id. It needs no tsconfig and builds
  no Program, so it runs in any repository that has a `dlint.config.ts`, and it includes project
  rules from `rulesDir`. Built for tooling that needs to know what dlint can detect: a review agent
  reads the inventory and checks a proposed change against it.

### Changed

- **A broken rule file no longer aborts the run.** A rule that throws on import, or whose `meta` is
  missing a `description`, is now skipped and reported by name instead of ending the whole lint.
  The run continues with the remaining rules; the skipped files appear in the output and under
  `skippedRules` in `--format json`. In practice this only affects project rules in your
  `rulesDir` — bundled rules ship validated. A `description` was always required by the type, but
  jiti strips types at runtime, so it is now checked when the rule loads.

## 1.5.1

### Fixed

- **Consumer rules resolve dlint's bundled TypeScript.** A project rule loaded from your `rulesDir`
  that imports `typescript` now always resolves dlint's bundled 6.x engine, not your project's
  compiler. On a TS7/`tsgo` project the bare import previously resolved the API-less TS7 package and
  crashed the run on the first rule. Bundled rules were already safe; this closes the same gap for
  consumer rules.
- **`no-db-antipatterns` no longer flags chunked inserts as N+1.** A `db.insert(...).values(chunk)`
  inside a loop is a deliberate multi-row batch, not a per-row N+1. The N+1 check now covers only
  `select`/`update`/`delete` — the operations `inArray()` batching actually rewrites.
- **`no-await-in-finally` only fires when the `try` has no `catch`.** `try { } catch { } finally
  { await ... }` is no longer flagged: the try error is already handled in the catch, so an awaited
  best-effort cleanup cannot mask it. A catch-less `try { } finally { await ... }` is still flagged.
- **`no-redundant-zod-parse` no longer flags `.safeParse()`.** Choosing `safeParse` means handling a
  possible failure, so it is always a validation boundary. Only `.parse()` is checked now.

## 1.5.0

### Changed

- **dlint ships its own TypeScript engine.** `typescript` moves from a peer dependency to a
  bundled dependency pinned to the last JavaScript-based line (`^6.0.3`). dlint now lints projects
  independently of the compiler they build with — including projects on the Go-native TypeScript 7
  (`tsgo`), whose package no longer exposes the in-process `createProgram`/`getTypeChecker` API that
  dlint's 86 rules run on. No config change needed, and consumers no longer need their own
  JavaScript `typescript` installed. A port to the native TS 7.1 API is on the roadmap.

## 1.4.0

### Added

- **`no-duplicate-schema-export` gains an `ignorePaths` option.** Files whose path includes a
  configured fragment are excluded from the duplicate scan — for a deliberately-mirrored,
  separately-bundled module whose copies never mix at runtime (e.g. an isolated `worker/`):
  `ruleOptions: { "no-duplicate-schema-export": { ignorePaths: ["worker/"] } }`. Real in-program
  duplicates are still flagged; default is `[]` (no behavior change for existing configs).

## 1.3.0

### Removed

- **Three CSS-Modules styling rules retired** from the universal set: `css-class-existence`,
  `no-css-properties`, and `no-static-inline-style`. They encoded a CSS-Modules styling stance,
  not a codebase-agnostic bug — `no-static-inline-style` even hardcoded an `app/styles/*.module.css`
  path in its message. A project that wants these conventions should ship them as project-specific
  rules in its own `rulesDir`. Built-in rule count: **89 → 86** (61 default + 25 opinionated).
  - A `dlint.config.ts` that referenced these ids (e.g. an `overrides` entry) keeps working — a
    stale rule-id override is a no-op; remove it at your convenience.

## 1.2.0

### Added

- **Rule groups** (`groups`): bundle rules under one severity and toggle them together. The package
  ships one built-in group, `opinionated`, set to `off`.
- **Per-rule options** (`ruleOptions`): override any rule's tunable values from `dlint.config.ts`
  without copying the rule, e.g. `ruleOptions: { "max-file-lines": { maxLines: 500 } }`.
- **Authoring skill** under `skills/dfine-lint` - a portable agent skill for writing, testing, and
  configuring rules.

### Changed

- **Opinionated rules now ship off by default.** ~27 style/architecture rules (plus a few
  opinionated sub-checks of `performance`, `typescript`, `no-implicit-coercion`) moved into the
  off-by-default `opinionated` group, so a zero-config run is a clean gate of universal bugs and
  framework-guarded checks - no false positives in a generic repo.
  - **Upgrading and want the previous behavior?** Re-enable them in `dlint.config.ts`:
    `groups: [{ id: "opinionated", severity: "error" }]`
- **CLI never prints a stack trace.** Any uncaught error becomes a one-line `dlint: <message>`
  with a non-zero exit code.
- All rules now type-check under the strict baseline (`pnpm typecheck`).

### Notes

- Existing configs keep working unchanged - the new fields are optional and their defaults live in
  the engine, so an old config automatically gets the new (sensible) defaults without edits.
