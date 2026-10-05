import { defineExtractor } from "../helpers/define-extractor.js";
import { packageOfFile } from "../helpers/ast.js";
import { collectTypeDeclarations, collectFunctionSignatures } from "../helpers/domain.js";
import type { TypeDeclaration } from "../types.js";

export default defineExtractor<TypeDeclaration>({
  id: "domain-declarations",
  name: "Domain Type Declaration Collector",
  extract(ctx) {
    // Project .d.ts files count: domain types often live in one, unlike executable code
    if (packageOfFile(ctx.sourceFile.fileName) !== undefined) return [];
    return [
      ...collectTypeDeclarations(ctx.sourceFile, ctx.checker),
      ...collectFunctionSignatures(ctx.sourceFile, ctx.checker),
    ];
  },
});
