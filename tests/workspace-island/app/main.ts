// Imports the workspace package through its node_modules link, as an app in a monorepo does.
import { greet } from "@ws/shared";
export const message = greet("app");
