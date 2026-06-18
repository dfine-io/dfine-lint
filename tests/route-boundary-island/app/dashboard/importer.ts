// route-boundary — app/dashboard importing from app/settings (cross-route) is a violation.
import { shared } from "../settings/shared"; // EXPECT: route-boundary
import { local } from "./local-helper";

export const use = shared + local;
