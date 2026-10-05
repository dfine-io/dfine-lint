// Enforces top-level route isolation in Next.js app directory.
// Cross-route imports between app/(group)/routeA and app/(group)/routeB are violations.
// Intra-route imports (within same top-level route) are always allowed.
// ALLOWED_TARGETS: shared path prefixes any route may import (e.g. app/styles).
// ALLOWED_PAIRS: explicit route name pairs where cross-import is permitted.
import ts from "typescript";
import { relative, sep } from "node:path";
import { defineRule, resolveImportedModule } from "@dfine-io-gmbh/dlint";

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
    const sourceSegs = getSegments(ctx.projectRoot, ctx.sourceFile.fileName);
    const sourceRoute = getTopLevelRoute(sourceSegs, appDir) ?? "";
    if (!sourceRoute) return;

    ctx.walk((node) => {
      // A re-export crosses the boundary like an import; type-only forms count too, they couple the routes
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node, node.moduleSpecifier);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [specifier] = node.arguments;
        if (specifier && ts.isStringLiteral(specifier)) checkImport(node, specifier);
      }
    });

    function checkImport(node: ts.Node, specifier: ts.StringLiteral): void {
      const resolved = resolveImportedModule(ctx.program, specifier);
      if (!resolved) return;
      const impSegs = getSegments(ctx.projectRoot, resolved.resolvedFileName);
      const importRoute = getTopLevelRoute(impSegs, appDir);
      if (!importRoute) return;
      // Same top-level route — always allowed
      if (sourceRoute === importRoute) return;
      if (resolved.isExternalLibraryImport) return;
      const impPath = impSegs.join("/");
      // "app/styles" (or "app/styles/") allows app/styles/** but not app/stylesheet
      if (allowedTargets.some((t) => { const base = t.replace(/\/+$/, ""); return impPath === base || impPath.startsWith(base + "/"); })) return;
      // allowedPairs name plain routes; a route group "(group)" never pairs
      const srcName = isRouteGroup(sourceRoute) ? undefined : sourceRoute;
      const impName = isRouteGroup(importRoute) ? undefined : importRoute;
      if (srcName && impName && allowedPairs.some(([s, t]) => s === srcName && t === impName)) return;
      ctx.reportAt(node, `Move cross-route import to lib/ -- ${sourceRoute} must not import from ${importRoute}`, {
        action: "move-to-shared",
        pattern: "Move shared code to lib/, components/ui/, or app/styles/",
      });
    }
  },
});
