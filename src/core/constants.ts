// constants.ts — System parameters only. No business logic, no project conventions.
import ts from "typescript";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DLINT_IGNORE_FILE = ".dlintignore";
export const MAX_FILE_SIZE = 500_000;
export const GIT_MAX_BUFFER = 10 * 1024 * 1024;
export const GIT_TIMEOUT_MS = 10_000;
// Directory of the bundled TypeScript lib.*.d.ts files (typescript.d.ts lives there too)
export const TS_LIB_DIR = dirname(ts.getDefaultLibFilePath({}));
// Universal rules shipped with the package, two levels above build/core
export const BUNDLED_RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dlint-rules", "universal");
