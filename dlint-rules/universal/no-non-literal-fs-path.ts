// Flags fs path APIs called with a parameter-derived path (path-traversal surface).
// Only the documented path-first fs methods are matched; fd-based methods are excluded.
// Allows static path literals. Self-contained: resolves the callee symbol to fs (alias-proof) +
// inlines parameter-taint.
import ts from "typescript";
import { defineRule, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const FS_PATH_METHODS = new Set([
  "readFile", "readFileSync", "writeFile", "writeFileSync", "appendFile", "appendFileSync",
  "readdir", "readdirSync", "unlink", "unlinkSync", "stat", "statSync", "lstat", "lstatSync",
  "access", "accessSync", "open", "openSync", "createReadStream", "createWriteStream",
  "rm", "rmSync", "rmdir", "rmdirSync", "mkdir", "mkdirSync", "copyFile", "copyFileSync",
  "realpath", "realpathSync", "readlink", "readlinkSync", "truncate", "truncateSync",
]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description: "No fs path API with a parameter-derived path (path traversal)",
  },
  check(ctx) {
    const checker = ctx.checker;
    const fsPathMethods = ctx.options.fsPathMethods ? new Set(ctx.options.fsPathMethods as string[]) : FS_PATH_METHODS;

    function tracesToParameter(node: ts.Node, seen: Set<ts.Node> = new Set()): boolean {
      if (ts.isIdentifier(node)) {
        const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
        if (!decl || seen.has(decl)) return false;
        if (ts.isParameter(decl)) return true;
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          seen.add(decl);
          return tracesToParameter(decl.initializer, seen);
        }
        return false;
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        return tracesToParameter(node.expression, seen);
      if (ts.isTemplateExpression(node))
        return node.templateSpans.some((s) => tracesToParameter(s.expression, seen));
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken
      )
        return tracesToParameter(node.left, seen) || tracesToParameter(node.right, seen);
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isNonNullExpression(node)
      )
        return tracesToParameter(node.expression, seen);
      return false;
    }

    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
      const callee = node.expression;
      let nameId: ts.Identifier | undefined;
      if (ts.isIdentifier(callee)) nameId = callee;
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name))
        nameId = callee.name;
      if (!nameId) return;
      const sym = checker.getSymbolAtLocation(nameId);
      if (!sym) return;
      const resolved = resolveSymbol(checker, sym);
      if (!fsPathMethods.has(resolved.name)) return;
      const fromFs = (resolved.declarations ?? []).some((decl) =>
        /\/@types\/node\/fs(?:\/promises)?\.d\.ts$/.test(decl.getSourceFile().fileName),
      );
      if (!fromFs) return;
      const path = node.arguments[0];
      if (!path || !tracesToParameter(path)) return;
      ctx.reportAt(
        path,
        `Path traversal: ${resolved.name}() with a parameter-derived path — resolve within a fixed base dir or validate against an allowlist`,
        {
          action: "validate-path",
          pattern: "Resolve the path and verify it stays within a fixed base directory",
          reference: "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html",
        },
      );
    });
  },
});
