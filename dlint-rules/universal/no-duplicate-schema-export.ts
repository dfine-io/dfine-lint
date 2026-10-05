// Flags exported Zod schemas that share a name across files: separate .brand() calls make incompatible types.
// A schema is a constant whose zod type derives from ZodType ($ZodType in zod 4); a ZodError is none.
import ts from "typescript";
import { relative } from "node:path";
import { classOrInterfaceOf, defineRule, isProjectSourceFile, isTypeFromPackage } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - defaults; override via ruleOptions["no-duplicate-schema-export"]
// ===========================================================================
// Path fragments excluded from the duplicate scan. Use for a deliberately-mirrored,
// separately-bundled module whose copies never mix at runtime (e.g. "worker/"): its schemas
// are not flagged as duplicates of the app's, while real in-program duplicates still are.
const IGNORE_PATHS: string[] = [];
// ===========================================================================

type DuplicateMap = Map<string, readonly string[]>;

const duplicateCache = new WeakMap<ts.Program, { key: string; map: DuplicateMap }>();

function isExportedStatement(node: ts.Statement): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

// A zod schema: ZodType / $ZodType or a base of it, also inside the intersection .brand() or a guard .refine() returns
function isZodSchemaType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnionOrIntersection()) return type.types.some((t) => isZodSchemaType(t, checker));
  const sym = type.getSymbol();
  if (sym && (sym.name === "ZodType" || sym.name === "$ZodType") && isTypeFromPackage(type, checker, "zod")) return true;
  const declared = classOrInterfaceOf(type);
  return !!declared && checker.getBaseTypes(declared).some((base) => isZodSchemaType(base, checker));
}

function buildDuplicateMap(
  program: ts.Program,
  checker: ts.TypeChecker,
  ignorePaths: readonly string[],
): DuplicateMap {
  // Names first, syntax only: only a name exported from two files needs a type check
  const byName = new Map<string, { file: string; name: ts.Identifier }[]>();
  for (const sf of program.getSourceFiles()) {
    if (!isProjectSourceFile(sf)) continue;
    if (ignorePaths.some((p) => sf.fileName.includes(p))) continue;
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !isExportedStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const list = byName.get(decl.name.text) ?? [];
        list.push({ file: sf.fileName, name: decl.name });
        byName.set(decl.name.text, list);
      }
    }
  }

  const duplicates: DuplicateMap = new Map();
  for (const [name, exports] of byName) {
    if (exports.length < 2) continue;
    const files = exports.filter((e) => isZodSchemaType(checker.getTypeAtLocation(e.name), checker)).map((e) => e.file);
    if (files.length >= 2) duplicates.set(name, files);
  }
  return duplicates;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "No duplicate Zod schema exports — distinct .brand() calls create incompatible types",
  },
  check(ctx) {
    const ignorePaths =
      (ctx.options.ignorePaths as string[] | undefined) ?? IGNORE_PATHS;
    const cacheKey = ignorePaths.join("\n");
    let cached = duplicateCache.get(ctx.program);
    if (!cached || cached.key !== cacheKey) {
      cached = {
        key: cacheKey,
        map: buildDuplicateMap(ctx.program, ctx.checker, ignorePaths),
      };
      duplicateCache.set(ctx.program, cached);
    }
    const dupes = cached.map;

    if (dupes.size === 0) return;

    ctx.walk((node) => {
      if (!ts.isVariableStatement(node) || !isExportedStatement(node)) return;

      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const files = dupes.get(decl.name.text);
        if (!files || !files.includes(ctx.sourceFile.fileName)) continue;

        const others = files
          .filter((f) => f !== ctx.sourceFile.fileName)
          .map((f) => relative(ctx.projectRoot, f));

        ctx.reportAt(
          decl.name,
          `Duplicate Zod schema '${decl.name.text}' — also exported from ${others.join(", ")}. Consumers get inconsistent validation`,
          {
            action: "consolidate-schema",
            pattern:
              "Keep one schema definition as SSOT, import from there in all consumers",
          },
        );
      }
    });
  },
});
