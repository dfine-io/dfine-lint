# dlint SDK API

Everything a rule can use. All imports come from `@dfine-io-gmbh/dlint` and `typescript`
only - a rule never imports from another rule.

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
    severity?: "error" | "warning",// in-rule default; usually omitted (engine default = error)
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

Actions:

- `ctx.walk((node: ts.Node) => void)` - visit every node in the current file.
- `ctx.reportAt(node, message, advisory?)` - flag a problem at a node.
- `ctx.createFix(node, newText)` - replace a node's text.
- `ctx.insertBefore(node, text)` / `ctx.insertAfter(node, text)` - insert around a node.
- `ctx.deleteNode(node)` - remove a node; one alone on its lines takes the lines with it, and a statement that is the whole body of an `if` or loop becomes `{}`.
- `ctx.isSubCheckDisabled(subCheckId: string): boolean` - gate a sub-check (see config ref).
- `ctx.options: Record<string, unknown>` - project overrides for this rule's tunable values.
  Always read as `ctx.options.key ?? DEFAULT` so behavior is identical when unset.

## Advisory + autofix

`reportAt`'s third argument:

```typescript
{
  action: string,        // short kebab id of the suggested fix, e.g. "add-await"
  pattern: string,       // how to fix it, human-readable
  reference?: string,    // optional doc URL
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
- `defineExtractor(opts)` - create a cross-rule data extractor.

File / directive / export:

- `hasDirective(sourceFile, "use server" | "use client" | ...)` - file-level directive present?
- `getExportedFunctions(sourceFile, checker)` -> `ExportedFunction[]` - every function declared and exported in this file, `export { a as b }` lists included; `name` is the local identifier, `func` the function node.
- `buildReferenceIndex(program, checker)` - cross-file export usage; prefer `ctx.referenceIndex`.

Symbol / type (the anti-heuristic core):

- `resolveSymbol(checker, symbol)` - follow aliases to the original declaration.
- `isFromPackage(identifier, checker, "react")` - symbol resolves into that npm package or its ambient `declare module`; a project folder named `react/` does not count.
- `isLibDeclaration(symbol)` - declared in TypeScript's own `lib.*.d.ts` (e.g. global `RegExp`, `Error`); a project file named `lib.*.d.ts` is not.
- `isNodeModulesDeclaration(symbol)` - declared in `node_modules`.
- `isNullableType(type)` - includes `null`/`undefined`? A type parameter answers through its constraint.
- `hasOwnToString(type)` - has its own `toString()` (not `[object Object]`)?
- `isStringType(type)` - a string: `string`, a string or template literal, `Uppercase<T>`-style mappings, or a union of these.
- `isAssignableTo(checker, source, target)` - structural compatibility.
- `unwrapPromiseType(type, checker)` - `T` from `Promise<T>`.
- `isBuiltinCollection(type, checker)` - `Map` / `Set` / `Array`, readonly forms included.
- `hasJsDocTag(declaration, "deprecated")` - JSDoc tag present.
- `isThenable(type, checker)` - has a callable `then`, or a member of its union or intersection does.
- `isSameReference(a, b, checker)` - two identifiers (by `valueSymbolOf`), property chains, element accesses with the same key, or `this`, that name the same thing; parentheses are skipped.

AST position:

- `isInsideLoop(node)` - runs per iteration: loop body, condition or update, not a once-run header such as the `for...of` iterable. Stops at function boundaries.
- `isInConditionalBranch(node)` - inside an `if`/`else` or ternary branch, not the condition. Stops at function boundaries.
- `isInBooleanContext(node)` - in a boolean position.
- `isWriteTarget(expression)` - assigned (also inside a destructuring pattern or a `for...in`/`for...of` head), incremented, decremented or deleted.
- `valueSymbolOf(identifier, checker)` - the variable an identifier names; in a shorthand property `{ a }` the variable, not the property, and in `{ a = b }` the default `b` names itself.

Detection:

- `isDbCall(node, checker, methods)` - ORM/DB call on a stored handle (`db`, `this.db`, `ctx.db`), e.g. Drizzle `select/insert/update/delete`; a query builder returned by a call is no handle.
- `dbRootMethod(node, checker, methods)` - the method called on that handle (`"select"`, `"insert"`, ...), or `null`.
- `returnTypeHasProperties(...)` - return type carries specific fields.

Cross-file:

- `resolveCallBody(...)` - resolve a function body across file boundaries.
- `bodyContainsCall(...)` - does a body call a specific function?
- `resolveImportedModule(program, specifier)` - resolve an import specifier literal the way the program does (resolution mode included), cached per program; use it instead of `ts.resolveModuleName`.
- `collectValueImports(program, sourceFile)` - the specifier literals a file loads at runtime under the program's options: value imports, value re-exports and `import("x")` calls; `literal.parent` is the declaration or call.
- `isTypeOnlyImport(declaration, compilerOptions)` - an import or re-export that loads nothing at runtime; under `verbatimModuleSyntax` only `import type` / `export type` count.

Result types: `LintResult.timings` (`LintTimings`) holds the phase and per-rule milliseconds of a `--benchmark` run, the shape of the json `timings` field.

Clone / similarity:

- `tokenizeFile(sourceFile)` -> `TokenizedBlock[]` - normalized token blocks, cached per source file; treat the result as read-only.
- `tokenSimilarity(a, b)` - bigram Jaccard between token sequences.

Domain / type shape:

- `collectTypeDeclarations(...)`, `collectFunctionSignatures(...)`, `memberJaccard(...)`,
  `signatureKey(...)` - interface/type discovery and signature fingerprints.

If a helper you need does not exist, add it to the SDK (`src/helpers/...`) and export it from
`src/index.ts` - do not inline a one-off heuristic in the rule.

## Deterministic patterns (symbol/type, not strings)

The difference between a shippable rule and a flaky one is almost always here.

**Identify an API by its origin, not its name.**

```typescript
// Avoid - name heuristic: any local `cache`/`fetch`/`Error` matches; breaks across codebases.
if (node.expression.text === "cache") {
  /* ... */
}

// Prefer - resolve the symbol to its package/lib.
if (
  ts.isIdentifier(node.expression) &&
  node.expression.text === "cache" &&
  isFromPackage(node.expression, ctx.checker, "react")
) {
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

**A finding is a codebase bug (G1.1).** When a rule fires on real code, the default is to fix
the code, not the rule. Loosen the rule only for a _true_ false positive, and only with a
generic, type/symbol-based condition - never a per-file or per-name patch.
