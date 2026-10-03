"use client";
// no-client-server-only-import — "use client" file importing a server-only module.
import "server-only"; // EXPECT: no-client-server-only-import
import { readFile } from "node:fs"; // EXPECT: no-client-server-only-import
import React from "react"; // NEGATIVE: client-safe import
import type { Stats } from "node:fs"; // NEGATIVE: a type-only import loads nothing
export { writeFile } from "node:fs"; // EXPECT: no-client-server-only-import

export const x = [typeof readFile, typeof React];
export type FileStats = Stats;
