import { defineExtractor } from "../helpers/define-extractor.js";
import { collectTypeDeclarations, collectFunctionSignatures } from "../helpers/domain.js";
import type { TypeDeclaration } from "../types.js";

export default defineExtractor<TypeDeclaration>({
  id: "domain-declarations",
  name: "Domain Type Declaration Collector",
  extract(ctx) {
    if (ctx.sourceFile.fileName.includes("node_modules")) return [];
    return [
      ...collectTypeDeclarations(ctx.sourceFile, ctx.checker),
      ...collectFunctionSignatures(ctx.sourceFile, ctx.checker),
    ];
  },
});
