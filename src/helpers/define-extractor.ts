import type { ExtractorDefinition, ExtractorContext, DashboardAdapter } from "../types.js";

interface DefineExtractorOptions<T> {
  id: string;
  name: string;
  extract: (ctx: ExtractorContext) => T[];
  dashboard?: DashboardAdapter<T>;
}

export function defineExtractor<T>(opts: DefineExtractorOptions<T>): ExtractorDefinition {
  return {
    id: opts.id,
    name: opts.name,
    extract: opts.extract,
    dashboard: opts.dashboard,
  };
}
