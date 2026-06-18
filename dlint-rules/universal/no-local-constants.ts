// Detects UPPER_SNAKE constants with primitive values outside */constants/* directories.
// Project convention: all constants must be centralized in constants/ directories.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const TRIVIAL_NUMBERS = new Set([0, 1, -1]);
// ===========================================================================

const UPPER_SNAKE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function getLiteralValue(node: ts.Expression): string | number | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return undefined;
}

export default defineRule({
  meta: {
    category: "architecture",
    description: "UPPER_SNAKE constants outside constants/ directories must be centralized",
  },
  check(ctx) {
    const trivialNumbers = ctx.options.trivialNumbers ? new Set(ctx.options.trivialNumbers as number[]) : TRIVIAL_NUMBERS;
    const projectRoot = ctx.program.getCurrentDirectory();
    const relativePath = ctx.sourceFile.fileName.slice(projectRoot.length + 1);
    if (relativePath.includes("/constants/")) return;

    ctx.walk((node) => {
      if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isIdentifier(node.name)) return;
      const value = getLiteralValue(unwrapExpression(node.initializer));
      if (value === undefined) return;
      const localName = node.name.text;
      if (!UPPER_SNAKE_PATTERN.test(localName)) return;
      if ((typeof value === "number" && trivialNumbers.has(value)) || value === "") return;

      ctx.reportAt(
        node,
        `Move "${localName}" to constants/ directory -- verify no equivalent exists and centralize`,
        { action: "centralize-constant", pattern: "Move to nearest constants/ directory, check for value redundancy and unify" },
      );
    });
  },
});
