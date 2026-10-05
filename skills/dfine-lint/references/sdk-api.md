# dlint SDK API

Everything a rule can use. Imports come from `@dfine-io-gmbh/dlint`, `typescript` and Node
built-ins (`node:path`, as several bundled rules do) - a rule never imports from another rule.

## Table of contents

- defineRule + rule shape
- The rule context (ctx)
- Advisory + autofix (TextChange)
- Helper catalogue (the only place shared logic lives)
- Deterministic patterns (symbol/type, not strings)

## defineRule + rule shape

```typescript
export default defineRule({
  meta: {
    category: "security" | "performance" | "quality" | "architecture",
    description: string,           // one line, names what it enforces
    severity?: "error" | "warning",// usually omitted: then override, group, config.severity, "error"
                                   // when set, it outranks every group - only an override turns it off
    subChecks?: number,            // count if the rule bundles several checks
  },
  nodeTypes?: ts.SyntaxKind[],     // optional visit filter; empty/omitted = all nodes
  check(ctx) { /* ... */ },
});
```

- The rule **id is the filename** (`no-floating-promises.ts` -> id `no-floating-promises`).
  Make it descriptive: it names the bug it finds.
- The whole rule is the default export; the engine loads it via jiti from source.

## The rule context (ctx)

Read-only compiler state:

- `ctx.program: ts.Program` - the full compiled project (shared across all rules, built once).
- `ctx.checker: ts.TypeChecker` - resolve types, symbols, assignability, signatures.
- `ctx.sourceFile: ts.SourceFile` - the current file's AST.
- `ctx.referenceIndex` - cross-file export-usage map (which exports are referenced where).
- `ctx.referencesDir: string` - base dir for advisory reference docs.
- `ctx.projectRoot: string` - the absolute project root: `--path`, else the config's directory, else the working directory; `program.getCurrentDirectory()` is always the working directory.

Actions:

- `ctx.walk((node: ts.Node) => void)` - visit every node in the current file.
- `ctx.report({ rule, severity, line, column, message, advisory?, subCheck? })` - the raw
  diagnostic sink under `reportAt`; the engine replaces `severity` with the configured level.
  Prefer `reportAt`, which derives `line` and `column` from the node.
- `ctx.reportAt(node, message, advisory?, subCheck?)` - flag a problem at a node; pass the sub-check id so its `ruleId:subCheckId` settings decide the severity.
- `ctx.createFix(node, newText)` - replace a node's text.
- `ctx.insertBefore(node, text)` / `ctx.insertAfter(node, text)` - insert around a node.
- `ctx.deleteNode(node)` - remove a node; one alone on its lines takes the lines with it, and a statement that is the whole body of an `if` or loop becomes `{}`.
- `ctx.isSubCheckDisabled(subCheckId: string): boolean` - the sub-check is off in this file, so skip its work (see "Severity precedence" in the config ref).
- `ctx.options: Record<string, unknown>` - project overrides for this rule's tunable values.
  Always read as `ctx.options.key ?? DEFAULT` so behavior is identical when unset.

## Advisory + autofix

`reportAt`'s third argument:

```typescript
{
  action: string,        // short kebab id of the suggested fix, e.g. "add-await"
  pattern: string,       // how to fix it, human-readable
  reference?: string,    // optional doc URL or path; a value without "/" resolves to referencesDir/<value>
  fix?: TextChange | TextChange[],  // optional deterministic autofix
}
```

`TextChange = { start: number; length: number; newText: string }`. Build them with
`ctx.createFix / insertBefore / insertAfter / deleteNode`. Add a `fix` only when it keeps what
the code does for every value the types allow; otherwise the `pattern` tells the user what to do.
A fix with several changes lands whole or not at all: the fixer applies fixes bottom-to-top and
skips one that overlaps a fix it already accepted. After `--fix` the CLI lints again.

## Helper catalogue

These are the ONLY shared building blocks - put cross-cutting logic here (in the SDK), never
copy it between rules.

Rule/extractor authoring:

- `defineRule(opts)` - create a rule.
- `defineExtractor({ id, name, extract, dashboard? })` - create a data extractor for `--extract`;
  `extract(ctx)` returns an array per file, `ctx` holds `program`, `checker`, `sourceFile`, and
  the config's `tags` and `directive`. Extractors load from `extractorsDir`.

File / directive / export:

- `hasDirective(sourceFile, "use server" | "use client" | ...)` - file-level directive present?
- `getExportedFunctions(sourceFile, checker)` -> `ExportedFunction[]` - every named function declaration and `const x = () => ...` / function-expression initializer exported from this file, `export { a as b }` lists included; an anonymous default export is not returned. `name` is the local identifier, `func` the function node.
- `buildReferenceIndex(program, checker)` - cross-file export usage; prefer `ctx.referenceIndex`.

Symbol / type (the anti-heuristic core):

- `resolveCallee(call, checker)` -> `ResolvedCallee | undefined` - what a call, `new` or tagged template invokes, through aliases and member access, cached per node: `symbol`, declared `name` (a default export reads its declaration's name), `lib`, `packageName` (also from a `declare module` shim), `moduleName` (ambient module such as `"fs"`, `node:` dropped) and `global` (a top-level global of the lib or a package; members and project code are not).
- `resolveSymbol(checker, symbol)` - follow aliases to the original declaration.
- `isFromPackage(identifier, checker, "react")` - symbol resolves into that npm package or its ambient `declare module`; a project folder named `react/` does not count.
- `isLibDeclaration(symbol)` - one of its declarations sits in TypeScript's own `lib.*.d.ts` (e.g. global `RegExp`, `Error`); a project file named `lib.*.d.ts` is not.
- `isTypeFromPackage(type, checker, "zod")` - the type, its alias, a union or intersection member, or a base class is declared in that npm package.
- `extendsLibType(type, checker, ["Error"])` - the type is one of those lib types or derives from one (`class E<T> extends TypeError`).
- `classOrInterfaceOf(type)` - the class or interface a type instantiates (`Box<string>` reads `Box`), for `checker.getBaseTypes`.
- `isProjectSourceFile(sourceFile)` - no `.d.ts` and not inside an installed package; a symlinked workspace package counts as project code.
- `isNodeModulesDeclaration(symbol)` - declared in `node_modules`.
- `isNullableType(type)` - includes `null`/`undefined`? A type parameter answers through its constraint.
- `hasOwnToString(type, checker)` - has its own `toString()` (not `[object Object]`)? Arrays, tuples, `Error`, `Date` and `RegExp` count.
- `isStringType(type)` - a string: `string`, a string or template literal, `Uppercase<T>`-style mappings, or a union of these.
- `isAssignableTo(checker, source, target)` - structural compatibility.
- `unwrapPromiseType(type, checker)` - `T` from `Promise<T>`.
- `isBuiltinCollection(type, checker)` - a lib `Array` / `Map` / `Set` / `WeakMap` / `WeakSet` / `Promise`, readonly forms included.
- `hasJsDocTag(symbol, ...tagNames)` - one of the JSDoc tags is present on the symbol, e.g. `hasJsDocTag(sym, "deprecated")`.
- `isThenable(type, checker)` - has a callable `then`, or a member of its union or intersection does.
- `isSameReference(a, b, checker)` - two identifiers (by `valueSymbolOf`), property chains, element accesses with the same key, or `this`, that name the same thing; parentheses are skipped.

AST position:

- `isInsideLoop(node)` - runs per iteration: loop body, condition or update, not a once-run header such as the `for...of` iterable. Stops at function boundaries.
- `isInConditionalBranch(node)` - inside an `if`/`else` or ternary branch, not the condition. Stops at function boundaries.
- `isInBooleanContext(node)` - in a boolean position.
- `isWriteTarget(expression)` - assigned (also inside a destructuring pattern or a `for...in`/`for...of` head), incremented, decremented or deleted.
- `valueSymbolOf(identifier, checker)` - the variable an identifier names; in a shorthand property `{ a }` the variable, not the property, and in `{ a = b }` the default `b` names itself.

Detection:

- `isDbCall(node, checker, methods, packageName?)` - ORM/DB call on a stored handle (`db`, `this.db`, `ctx.db`), e.g. Drizzle `select/insert/update/delete`; a query builder returned by a call is no handle. With `packageName` the handle's type must come from that package.
- `dbRootMethod(node, checker, methods, packageName?)` - the method called on that handle (`"select"`, `"insert"`, ...), or `null`.
- `returnTypeHasProperties(...)` - return type carries specific fields.

Cross-file:

- `resolveCallBody(...)` - resolve a function body across file boundaries.
- `bodyContainsCall(...)` - does a body call a name? It matches spellings; walk the body with `resolveCallee` instead. It goes in 2.0.
- `resolveImportedModule(program, specifier)` - resolve an import specifier literal the way the program does (resolution mode included), cached per program; use it instead of `ts.resolveModuleName`.
- `collectValueImports(program, sourceFile)` - the specifier literals a file loads at runtime under the program's options: value imports, value re-exports and `import("x")` calls; `literal.parent` is the declaration or call.
- `isTypeOnlyImport(declaration, compilerOptions)` - an import or re-export that loads nothing at runtime; under `verbatimModuleSyntax` only `import type` / `export type` count.

Result types: `LintResult` holds `diagnostics`, `fileCount`, `ruleCount`, `checkCount` (sub-checks
counted), `errorCount`, `warningCount`, `fixableCount`, `durationMs`, `skippedRules?` (rule files
that failed to load, with the reason) and `timings?`. `LintResult.timings` (`LintTimings`) holds
the phase and per-rule milliseconds of a `--benchmark` run, the shape of the json `timings` field.

Clone / similarity:

- `tokenizeFile(sourceFile)` -> `TokenizedBlock[]` - normalized token blocks of every function-like body with at least 5 statements, cached per source file; treat the result as read-only.
- `tokenSimilarity(a, b)` - bigram set Jaccard; repeats saturate it, use `tokenBagSimilarity`. It goes in 2.0.
- `tokenBagSimilarity(a, b)` - bigram Jaccard over multisets: a repeated bigram counts each time, not once.

Domain / type shape:

- `collectTypeDeclarations(...)`, `collectFunctionSignatures(...)`, `memberJaccard(...)`,
  `signatureKey(...)` - interface/type discovery and signature fingerprints.

Exported types: `src/index.ts` exports the config, rule, result and extractor types
(`DlintConfig`, `RuleMeta`, `DefineRuleOptions`, `LintResult`, `ExtractorContext`, `ResolvedCallee`,
...). `RuleContext`, `EnhancedRuleContext`, `Advisory`, `Diagnostic`, `RuleGroup` and `SkippedRule`
are not exported from the package.

If a helper you need does not exist, add it to the SDK (`src/helpers/...`) and export it from
`src/index.ts` - do not inline a one-off heuristic in the rule.

## Deterministic patterns (symbol/type, not strings)

The difference between a shippable rule and a flaky one is almost always here.

Replace each string check with the compiler fact it guesses at:

| String check                                  | Compiler fact                                                  |
| --------------------------------------------- | -------------------------------------------------------------- |
| `callee.text === "useEffect"`                 | `resolveCallee(call, checker)` -> `name` + `packageName`       |
| `fetch`, `setTimeout` or another global name  | `resolveCallee(...)` -> `global` or `lib`                      |
| module path regex such as `/^(node:)?fs$/`    | `resolveCallee(...)` -> `moduleName === "fs"`                  |
| receiver has `parse` and `safeParse`          | `isTypeFromPackage(type, checker, "zod")`                      |
| class name ends in `Error`                    | `extendsLibType(type, checker, ["Error"])`                     |
| `new RegExp` by identifier                    | `extendsLibType(calleeType, checker, ["RegExpConstructor"])`   |
| `typeName.text === "Partial"`                 | `checker.getSymbolAtLocation(typeName)` + `isLibDeclaration`   |
| `typeName.text === "const"`                   | `ts.isConstTypeReference(typeNode)`                            |
| `fileName.endsWith(".tsx")`                   | `sourceFile.languageVariant === ts.LanguageVariant.JSX`        |
| `fileName.endsWith(".d.ts")`                  | `sourceFile.isDeclarationFile`                                 |
| `fileName.includes("node_modules")`           | `isProjectSourceFile(sourceFile)`                              |
| `fileName.slice(cwd.length + 1)`              | `relative(ctx.projectRoot, fileName)`                          |

- Accept a missed value alias such as `const f = fetch; f(url)` - resolveCallee sees a local variable, and a guessed alias costs false positives.

**Identify an API by its origin, not its name.**

```typescript
// Avoid - name heuristic: any local `cache`/`fetch`/`Error` matches; breaks across codebases.
if (node.expression.text === "cache") {
  /* ... */
}

// Prefer - resolve the callee: aliases, `React.cache` and namespace imports included.
const callee = resolveCallee(node, ctx.checker);
if (callee?.packageName === "react" && callee.name === "cache") {
  /* ... */
}
```

**Decide on types, not on spellings.**

```typescript
// Avoid - guessing nullability from a name.
if (/maybe|opt/i.test(name)) {
  /* ... */
}

// Prefer - ask the checker.
const t = ctx.checker.getTypeAtLocation(node);
if (isNullableType(t)) {
  /* ... */
}
```

**Make tunable knobs options, never path/name special-cases.**

```typescript
// Avoid - special-casing a project's folders inside the rule.
if (filePath.includes("/legacy/")) return;

// Prefer - a CONFIG default the project can override via ruleOptions.
const ignored = (ctx.options.ignoredDirs as string[]) ?? IGNORED_DIRS;
```

**A finding is a codebase bug.** When a rule fires on real code, the default is to fix
the code, not the rule. Loosen the rule only for a _true_ false positive, and only with a
generic, type/symbol-based condition - never a per-file or per-name patch.
