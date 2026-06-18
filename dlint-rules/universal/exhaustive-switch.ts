// Ensures switch statements over union/enum types handle all members.
// Flags missing case clauses when no default is present.
// Uses assignability check to match case expression types against union members.
import ts from "typescript";
import { defineRule, isAssignableTo } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description: "Switch over union/enum must handle all cases or have default",
  },
  check(ctx) {
    ctx.walk((node) => {
      if (!ts.isSwitchStatement(node)) return;
      const exprType = ctx.checker.getTypeAtLocation(node.expression);
      if (!exprType.isUnion()) return;
      if (node.caseBlock.clauses.some((c) => ts.isDefaultClause(c))) return;

      const caseTypes: ts.Type[] = [];
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause)) {
          caseTypes.push(ctx.checker.getTypeAtLocation(clause.expression));
        }
      }

      const missing = exprType.types.filter(
        (member) =>
          !caseTypes.some((ct) => isAssignableTo(ctx.checker, member, ct))
      );

      if (missing.length > 0) {
        const missingNames = missing.map((t) => {
          const name = ctx.checker.typeToString(t);
          const decl = t.symbol?.valueDeclaration;
          if (decl && (ts.isEnumMember(decl) || ts.isPropertyAccessExpression(decl) || ts.isElementAccessExpression(decl))) {
            const val = ctx.checker.getConstantValue(decl as ts.EnumMember);
            if (val !== undefined) return `${name} (= ${val})`;
          }
          return name;
        });
        const lastClause = node.caseBlock.clauses[node.caseBlock.clauses.length - 1];
        const defaultFix = lastClause
          ? ctx.insertAfter(lastClause, "\n    default: throw new Error(\"Unhandled case\");")
          : undefined;
        ctx.reportAt(
          node,
          `Add missing cases to switch: ${missingNames.join(", ")}`,
          {
            action: "add-cases",
            pattern: `Add case clauses for ${missingNames.join(", ")} or add a default clause`,
            reference: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking",
            fix: defaultFix,
          }
        );
      }
    });
  },
});
