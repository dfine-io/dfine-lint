// Flags child_process exec()/execSync() with a parameter-derived command (command injection).
// exec/execSync spawn a shell, so a tainted command string is injectable; execFile/spawn with an
// argument array are intentionally NOT flagged. Allows static command literals.
// Self-contained: resolves the callee symbol to child_process (alias-proof) + inlines parameter-taint.
import ts from "typescript";
import { defineRule, resolveSymbol } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const SHELL_METHODS = new Set(["exec", "execSync"]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description:
      "No child_process exec()/execSync() with a parameter-derived command (command injection)",
  },
  check(ctx) {
    const shellMethods = ctx.options.shellMethods ? new Set(ctx.options.shellMethods as string[]) : SHELL_METHODS;
    const checker = ctx.checker;

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
      // Resolve the callee to its original export — alias-proof, symbol-based (no source-name match).
      const sym = checker.getSymbolAtLocation(nameId);
      if (!sym) return;
      const resolved = resolveSymbol(checker, sym);
      if (!shellMethods.has(resolved.name)) return;
      const fromChildProcess = (resolved.declarations ?? []).some((decl) =>
        /\/@types\/node\/child_process\.d\.ts$/.test(decl.getSourceFile().fileName),
      );
      if (!fromChildProcess) return;
      const cmd = node.arguments[0];
      if (!cmd || !tracesToParameter(cmd)) return;
      ctx.reportAt(
        cmd,
        `Command injection: ${resolved.name}() runs a shell with a parameter-derived command — use execFile()/spawn() with an argument array`,
        {
          action: "use-execfile-args",
          pattern: "Use execFile(cmd, [arg1, arg2]) -> no shell string interpolation",
          reference: "https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html",
        },
      );
    });
  },
});
