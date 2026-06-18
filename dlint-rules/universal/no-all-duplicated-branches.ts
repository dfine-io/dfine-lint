// Flags an if/else-if/else chain or a switch where EVERY branch body is identical, so the
// condition decides nothing (the branches were probably meant to differ). Requires a final
// else / default - an open-ended chain legitimately does nothing on the unmatched path.
// Self-contained: inlines its own structural-equality check.
import ts from "typescript";
import { defineRule } from "@dfine-io-gmbh/dlint";

function structurallyEqual(a: ts.Node, b: ts.Node): boolean {
  if (a.kind !== b.kind) return false;
  if (ts.isIdentifier(a) && ts.isIdentifier(b) && a.text !== b.text) return false;
  if (ts.isStringLiteral(a) && ts.isStringLiteral(b) && a.text !== b.text) return false;
  if (ts.isNumericLiteral(a) && ts.isNumericLiteral(b) && a.text !== b.text) return false;
  if (ts.isNoSubstitutionTemplateLiteral(a) && ts.isNoSubstitutionTemplateLiteral(b) && a.text !== b.text)
    return false;
  const ac = a.getChildren();
  const bc = b.getChildren();
  if (ac.length !== bc.length) return false;
  return ac.every((child, i) => structurallyEqual(child, bc[i]!));
}

export default defineRule({
  meta: {
    category: "quality",
    description: "No if/else or switch where every branch is identical (condition decides nothing)",
  },
  check(ctx) {
    ctx.walk((node) => {
      // if/else-if/else chain - process only at the chain head
      if (
        ts.isIfStatement(node) &&
        !(ts.isIfStatement(node.parent) && node.parent.elseStatement === node)
      ) {
        const bodies: ts.Statement[] = [node.thenStatement];
        let cur: ts.Statement | undefined = node.elseStatement;
        while (cur && ts.isIfStatement(cur)) {
          bodies.push(cur.thenStatement);
          cur = cur.elseStatement;
        }
        if (!cur) return; // no final else -> the unmatched path differs, not a bug
        bodies.push(cur);
        const first = bodies[0]!;
        if (bodies.length >= 2 && bodies.every((s) => structurallyEqual(s, first))) {
          ctx.reportAt(node, "All branches are identical -- the condition decides nothing", {
            action: "collapse-identical-branches",
            pattern: "Collapse the branches into one statement - they are identical",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else",
          });
        }
        return;
      }

      // switch - every clause body identical and a default present
      if (ts.isSwitchStatement(node)) {
        const clauses = node.caseBlock.clauses;
        if (clauses.length < 2) return;
        if (!clauses.some((c) => c.kind === ts.SyntaxKind.DefaultClause)) return;
        // any empty (fallthrough) clause makes "all identical" meaningless - skip
        if (clauses.some((c) => c.statements.length === 0)) return;
        const first = clauses[0]!;
        const allEqual = clauses.every(
          (c) =>
            c.statements.length === first.statements.length &&
            c.statements.every((s, i) => structurallyEqual(s, first.statements[i]!)),
        );
        if (allEqual) {
          ctx.reportAt(node, "All switch branches are identical -- the switch decides nothing", {
            action: "collapse-identical-branches",
            pattern: "Collapse the cases into one statement - they are identical",
            reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/switch",
          });
        }
      }
    });
  },
});
