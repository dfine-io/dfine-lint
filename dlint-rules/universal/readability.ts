// Flags readability issues: prefer as const, no this alias,
// nested template literals, nested ternaries, nested switches.
// These patterns compile but reduce code comprehension.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Readability: nested ternary/switch/template, as-const, this-alias",
    subChecks: 5,
  },
  check(ctx) {
    ctx.walk((node) => {
      // prefer-as-const: let x = "hello" as "hello" → as const
      if (
        ts.isAsExpression(node) && ts.isStringLiteral(node.expression) &&
        ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal) &&
        node.expression.text === node.type.literal.text
      ) {
        ctx.reportAt(node, `as "${node.expression.text}" - use as const`, { action: "use-as-const", pattern: "Replace as 'literal' with as const", fix: ctx.createFix(node.type, "const"), reference: "https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions" });
      }

      // no-this-alias: const self = this
      if (
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        node.initializer && node.initializer.kind === ts.SyntaxKind.ThisKeyword
      ) {
        ctx.reportAt(node, `'${node.name.text} = this' — use arrow function instead`, { action: "use-arrow-function", pattern: "Use arrow function to preserve this binding" });
      }

      // nested template literal
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) {
          if (!ts.isTemplateExpression(span.expression)) continue;
          ctx.reportAt(span.expression, "Nested template literal — extract to variable", {
            action: "extract-variable", pattern: "const inner = `..`; const outer = `${inner}`",
          });
        }
      }

      // nested ternary
      if (
        ts.isConditionalExpression(node) &&
        (ts.isConditionalExpression(node.whenTrue) || ts.isConditionalExpression(node.whenFalse))
      ) {
        ctx.reportAt(node, "Nested ternary — use if/else or switch for readability", { action: "use-if-else", pattern: "if (a) { ... } else if (b) { ... } else { ... }" });
      }

      // nested switch
      if (ts.isSwitchStatement(node)) {
        for (const clause of node.caseBlock.clauses) {
          for (const stmt of clause.statements) {
            if (!ts.isSwitchStatement(stmt)) continue;
            ctx.reportAt(stmt, "Nested switch — extract inner switch to function", {
              action: "extract-function", pattern: "Move inner switch to dedicated function",
            });
          }
        }
      }
    });
  },
});
