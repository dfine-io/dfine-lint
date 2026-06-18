// Flags exported Zod schema constants that share the same name across multiple files.
// Duplicate Zod .brand() calls create distinct TypeScript brand identities at runtime,
// making values from one file incompatible with the other — a subtle type-safety bug.
// Detection: TypeChecker structural check (has parse + safeParse methods), not name-suffix.
// Uses WeakMap<Program> cache for O(N×E) one-time scan + O(1) per-file check.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

type DuplicateMap = Map<string, readonly string[]>;

const duplicateCache = new WeakMap<ts.Program, DuplicateMap>();

function isExportedStatement(node: ts.Statement): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isZodSchemaType(type: ts.Type): boolean {
  return !!type.getProperty("parse") && !!type.getProperty("safeParse");
}

function buildDuplicateMap(program: ts.Program, checker: ts.TypeChecker): DuplicateMap {
  const collected = new Map<string, string[]>();

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes("node_modules")) continue;

    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !isExportedStatement(stmt)) continue;

      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        if (!isZodSchemaType(checker.getTypeAtLocation(decl.name))) continue;

        const list = collected.get(decl.name.text);
        if (list) {
          list.push(sf.fileName);
        } else {
          collected.set(decl.name.text, [sf.fileName]);
        }
      }
    }
  }

  const duplicates: DuplicateMap = new Map();
  for (const [name, files] of collected) {
    if (files.length >= 2) duplicates.set(name, files);
  }
  return duplicates;
}

function shortenPath(fullPath: string, programRoot: string): string {
  return fullPath.startsWith(programRoot)
    ? fullPath.slice(programRoot.length + 1)
    : fullPath;
}

export default defineRule({
  meta: {
    category: "quality",
    description:
      "No duplicate *Schema exports — distinct .brand() calls create incompatible types",
  },
  check(ctx) {
    let dupes = duplicateCache.get(ctx.program);
    if (!dupes) {
      dupes = buildDuplicateMap(ctx.program, ctx.checker);
      duplicateCache.set(ctx.program, dupes);
    }

    if (dupes.size === 0) return;
    const root = ctx.program.getCurrentDirectory();

    ctx.walk((node) => {
      if (!ts.isVariableStatement(node) || !isExportedStatement(node)) return;

      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const files = dupes.get(decl.name.text);
        if (!files || !files.includes(ctx.sourceFile.fileName)) continue;

        const others = files
          .filter((f) => f !== ctx.sourceFile.fileName)
          .map((f) => shortenPath(f, root));

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
