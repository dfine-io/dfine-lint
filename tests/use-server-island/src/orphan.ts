"use server"; // EXPECT: unnecessary-use-server
// No client file reaches this action, so the rule must fire here: proves the island run is live.

export async function orphan(value: number): Promise<number> {
  return value - 1;
}
