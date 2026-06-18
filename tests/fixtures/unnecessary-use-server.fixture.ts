"use server";
// unnecessary-use-server — orphan "use server" file: exported action with no client caller.
// EXPECT: unnecessary-use-server@1
// (File-granular rule: no in-file negative — a client-reachable file simply does not fire.)

export async function orphanAction(value: number) {
  return value + 1;
}
