// Fixture rule for the list-rules test: its description deliberately exceeds the 120-character
// contract so the harness proves the length check actually fires instead of silently passing.
import { defineRule } from "@dfine-io-gmbh/dlint";

export default defineRule({
  meta: {
    category: "quality",
    description:
      "This description is deliberately far longer than the one hundred and twenty character contract limit so the length check has a real failure to catch",
  },
  check() {},
});
