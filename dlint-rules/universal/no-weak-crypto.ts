// Flags weak hash algorithms (md5/sha1/...) passed to crypto.createHash/createHmac. The algorithm is
// read from a string-literal arg of a symbol-confirmed `crypto` call — a closed, authoritative set,
// not a name heuristic. Self-contained: resolves the callee into Node's crypto module (alias-proof).
import ts from "typescript";
import { defineRule, resolveCallee } from "@dfine-io-gmbh/dlint";

// ===========================================================================
// CONFIG - tune for your project; the rule logic below stays generic
// ===========================================================================
const WEAK_ALGORITHMS = new Set([
  "md5", "md4", "sha1", "rc4", "des", "des-ede", "des-ede3",
]);
const HASH_METHODS = new Set(["createHash", "createHmac"]);
// ===========================================================================

export default defineRule({
  meta: {
    category: "security",
    description: "No weak crypto hash algorithm (md5/sha1/...) in createHash/createHmac",
  },
  check(ctx) {
    const checker = ctx.checker;
    const weakAlgorithms = ctx.options.weakAlgorithms ? new Set(ctx.options.weakAlgorithms as string[]) : WEAK_ALGORITHMS;
    const hashMethods = ctx.options.hashMethods ? new Set(ctx.options.hashMethods as string[]) : HASH_METHODS;

    ctx.walk((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
      const callee = resolveCallee(node, checker);
      if (!callee || callee.moduleName !== "crypto" || !hashMethods.has(callee.name)) return;
      const algo = node.arguments[0];
      if (!algo || !ts.isStringLiteral(algo)) return;
      if (!weakAlgorithms.has(algo.text.toLowerCase())) return;
      ctx.reportAt(
        algo,
        `Weak crypto algorithm "${algo.text}" — use sha256 or stronger`,
        { action: "use-strong-hash", pattern: 'Use sha256 or stronger - crypto.createHash("sha256")', reference: "https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html" },
      );
    });
  },
});
