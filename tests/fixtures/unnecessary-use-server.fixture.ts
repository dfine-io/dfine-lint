"use strict";
"use server";
// unnecessary-use-server — orphan "use server" file: exported action with no client caller.
// The report anchors on the "use server" statement, not on the "use strict" ahead of it.
// EXPECT: unnecessary-use-server@2
// (File-granular rule: no in-file negative — a client-reachable file simply does not fire.)

export async function orphanAction(value: number) {
  return value + 1;
}
