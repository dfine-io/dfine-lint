// Flags empty function/method/arrow bodies with no statements or comments.
// Empty bodies indicate unfinished implementation or missing cleanup.
// Exempts abstract methods, constructors, and no-op callbacks.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function getFunctionBody(node: ts.Node): ts.Block | undefined {
  if (ts.isFunctionDeclaration(node)) return node.body;
  if (ts.isMethodDeclaration(node)) return node.body;
  if (ts.isFunctionExpression(node)) return node.body;
  if (ts.isArrowFunction(node) && ts.isBlock(node.body)) return node.body;
  if (ts.isConstructorDeclaration(node)) return node.body;
  return undefined;
}

function getFunctionName(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  )
    return node.name.text;
  return null;
}

export default defineRule({
  meta: {
    category: "quality",
    description: "Empty function body — add implementation or comment",
  },
  check(ctx) {
    ctx.walk((node) => {
      const body = getFunctionBody(node);
      if (!body || !ts.isBlock(body) || body.statements.length > 0) return;

      if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
        if (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Abstract)
          return;
      }
      if (ts.isConstructorDeclaration(node)) return;
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const parent = node.parent;
        if (ts.isPropertyAssignment(parent)) return;
        if (ts.isCallExpression(parent)) return;
        if (
          (ts.isParameter(parent) || ts.isVariableDeclaration(parent)) &&
          node.parameters.length === 0
        )
          return;
      }

      // Check for comments inside empty block via Compiler API (not getFullText)
      const sourceText = ctx.sourceFile.getFullText();
      const afterOpenBrace = body.getStart(ctx.sourceFile) + 1;
      const hasComment = ts.getLeadingCommentRanges(sourceText, afterOpenBrace);
      if (hasComment) return;

      const name = getFunctionName(node);
      ctx.reportAt(
        node,
        `Empty function${name ? ` '${name}'` : ""} — add implementation or comment`,
        {
          action: "add-implementation",
          pattern: "Add function body or a comment explaining why it's empty",
          reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions",
        }
      );
    });
  },
});
