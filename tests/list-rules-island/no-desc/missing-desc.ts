// Fixture rule for the list-rules test: meta has no description at all. TypeScript requires one,
// but jiti strips types, so this is what a malformed project rule looks like at runtime. Loading
// it must fail loudly instead of emitting an entry without the second contract field.
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
  } as never,
  check() {},
});
