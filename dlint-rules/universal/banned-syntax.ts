// Flags banned JS syntax patterns: void expressions, labeled statements,
// lone blocks, multiline string continuations, octal escapes, delete on variables,
// and global variable reassignment.
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Banned syntax: void, labels, lone-blocks, multi-str, octal, delete-var, global-assign",
    subChecks: 7,
  },
  check(ctx) {
    ctx.walk((node) => {
      // no-void
      if (ts.isVoidExpression(node)) {
        // Auto-fix only `void <number-literal>` (e.g. void 0); `void <expr>` may drop a side effect.
        ctx.reportAt(node, "Avoid void expression — use undefined directly", {
          action: "use-undefined",
          pattern: "Use undefined instead of void 0",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/void",
          ...(ts.isNumericLiteral(node.expression)
            ? { fix: ctx.createFix(node, "undefined") }
            : {}),
        });
      }

      // no-labels — labeled statements
      if (ts.isLabeledStatement(node)) {
        ctx.reportAt(node, "Labeled statements are goto-like — restructure control flow", {
          action: "remove-label", pattern: "Use functions or early returns instead of labels",
        });
      }

      // no-lone-blocks — unnecessary block statement
      if (ts.isBlock(node) && ts.isBlock(node.parent)) {
        ctx.reportAt(node, "Unnecessary nested block — remove braces", {
          action: "remove-block", pattern: "Remove redundant {} wrapper",
        });
      }

      // no-multi-str — multiline string with backslash
      if (ts.isStringLiteral(node)) {
        const raw = node.getText(ctx.sourceFile);
        if (raw.includes("\\\n") || raw.includes("\\\r")) {
          ctx.reportAt(node, "Use template literal for multiline strings", {
            action: "use-template", pattern: "Use a template literal instead of backslash line continuation",
          });
        }
      }

      // no-octal-escape — octal escape sequences in strings
      if (ts.isStringLiteral(node)) {
        const raw = node.getText(ctx.sourceFile);
        if (/\\[1-7]/.test(raw)) {
          ctx.reportAt(node, "Octal escape sequences are deprecated — use unicode escapes", {
            action: "use-unicode", pattern: "Use a unicode escape (\\u0041) instead of an octal escape (\\101)",
          });
        }
      }

      // no-delete-var — delete on variable identifier
      if (ts.isDeleteExpression(node) && ts.isIdentifier(node.expression)) {
        ctx.reportAt(node, "Do not use delete on variables — only on object properties", {
          action: "remove-delete", pattern: "Set the variable to undefined instead of deleting it",
        });
      }

      // no-global-assign — assignment to global variable
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(node.left)) {
        const sym = ctx.checker.getSymbolAtLocation(node.left);
        if (sym && isLibDeclaration(sym)) {
          ctx.reportAt(node, `Do not reassign global '${node.left.text}'`, {
            action: "no-global-reassign", pattern: "Use a local variable instead of reassigning globals",
          });
        }
      }
    });
  },
});
