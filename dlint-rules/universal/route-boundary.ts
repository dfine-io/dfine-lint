// Enforces top-level route isolation in Next.js app directory.
// Cross-route imports between app/(group)/routeA and app/(group)/routeB are violations.
// Intra-route imports (within same top-level route) are always allowed.
// ALLOWED_TARGETS: shared path prefixes any route may import (e.g. app/styles).
// ALLOWED_PAIRS: explicit route name pairs where cross-import is permitted.
import ts from "typescript";
import { relative, sep } from "node:path";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - defaults; a project overrides these via config
// ruleOptions["route-boundary"] = { appDir, allowedTargets, allowedPairs }
// ===========================================================================

const APP_DIR = "app";

const ALLOWED_TARGETS: string[] = [
  "app/styles",
];

const ALLOWED_PAIRS: [string, string][] = [];

// ===========================================================================

function getSegments(projectRoot: string, filePath: string): string[] {
  return relative(projectRoot, filePath).split(sep);
}

function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

// Top-level route = first segment after app/ (group or plain name)
// app/(group)/page/... -> "(group)"
// app/foo/[id]/... -> "foo"
// app/bar/[slug]/... -> "bar"
// Everything under the same top-level segment is the same route — no intra-route checks
function getTopLevelRoute(segments: string[], appDir: string): string | null {
  if (segments[0] !== appDir || segments.length < 2) return null;
  return segments[1] ?? null;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "Top-level route boundary isolation",
  },
  check(ctx) {
    const appDir = (ctx.options.appDir as string) ?? APP_DIR;
    const allowedTargets = (ctx.options.allowedTargets as string[]) ?? ALLOWED_TARGETS;
    const allowedPairs = (ctx.options.allowedPairs as [string, string][]) ?? ALLOWED_PAIRS;
    const projectRoot = ctx.program.getCurrentDirectory();
    const sourceSegs = getSegments(projectRoot, ctx.sourceFile.fileName);
    const sourceRoute = getTopLevelRoute(sourceSegs, appDir) ?? "";
    if (!sourceRoute) return;
    const compilerOptions = ctx.program.getCompilerOptions();

    ctx.walk((node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node, node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [specifier] = node.arguments;
        if (specifier && ts.isStringLiteral(specifier)) checkImport(node, specifier.text);
      }
    });

    function checkImport(node: ts.Node, specifier: string): void {
      const resolved = ts.resolveModuleName(specifier, ctx.sourceFile.fileName, compilerOptions, ts.sys);
      const resolvedPath = resolved.resolvedModule?.resolvedFileName;
      if (!resolvedPath) return;
      const impSegs = getSegments(projectRoot, resolvedPath);
      const importRoute = getTopLevelRoute(impSegs, appDir);
      if (!importRoute) return;
      // Same top-level route — always allowed
      if (sourceRoute === importRoute) return;
      const sf = ctx.program.getSourceFile(resolvedPath);
      if (sf && ctx.program.isSourceFileFromExternalLibrary(sf)) return;
      const impPath = impSegs.join("/");
      if (allowedTargets.some(t => impPath.startsWith(t))) return;
      // Extract bare route names (strip groups) for allowedPairs check
      const srcName = sourceRoute.split("/").find(s => !isRouteGroup(s));
      const impName = importRoute.split("/").find(s => !isRouteGroup(s));
      if (srcName && impName && allowedPairs.some(([s, t]) => s === srcName && t === impName)) return;
      ctx.reportAt(node, `Move cross-route import to lib/ -- ${sourceRoute} must not import from ${importRoute}`, {
        action: "move-to-shared",
        pattern: "Move shared code to lib/, components/ui/, or app/styles/",
      });
    }
  },
});
