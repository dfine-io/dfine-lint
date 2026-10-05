// route-boundary — app/dashboard importing from app/settings (cross-route) is a violation.
import { shared } from "../settings/shared"; // EXPECT: route-boundary
import { local } from "./local-helper";
export { shared as reExported } from "../settings/shared"; // EXPECT: route-boundary
// NEGATIVE: app/styles is an allowed target; app/stylesheet matches it by prefix only
import { spacing } from "../styles/tokens";
import { theme } from "../stylesheet/theme"; // EXPECT: route-boundary

export const use = shared + local + spacing + theme;
