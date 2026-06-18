// Flags magic number literals outside known safe contexts.
// Magic numbers obscure intent — extract to named constants for clarity.
// Exempts 0, 1, -1, 2, enum members, variable declarations, property values.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const IGNORED_NUMBERS = new Set([0, 1, -1, 2]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "quality",
    description: "Magic numbers: extract to named constants",
    subChecks: 1,
  },
  check(ctx) {
    const ignoredNumbers = ctx.options.ignoredNumbers ? new Set(ctx.options.ignoredNumbers as number[]) : IGNORED_NUMBERS;
    ctx.walk((node) => {
      if (ts.isNumericLiteral(node)) {
        const value = Number(node.text);
        if (ignoredNumbers.has(value)) return;
        if (ts.isEnumMember(node.parent)) return;
        if (ts.isLiteralTypeNode(node.parent)) return;
        if (ts.isElementAccessExpression(node.parent)) return;
        if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return;
        if (ts.isPropertyAssignment(node.parent)) return;
        if (ts.isReturnStatement(node.parent)) return;
        if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return;
        // Handle negated numbers: -9 in `const X = -9` or `{ key: -9 }`
        if (ts.isPrefixUnaryExpression(node.parent)) {
          const gp = node.parent.parent;
          if ((ts.isVariableDeclaration(gp) && ts.isIdentifier(gp.name)) || ts.isPropertyAssignment(gp)) return;
        }
        ctx.reportAt(node, `Magic number ${node.text} - extract to named constant`, {
          action: "extract-constant", pattern: "Extract to named constant - const MAX_RETRIES = 3;",
        });
      }
    });
  },
});
