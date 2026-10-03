"use server";
// Reached by client.ts only through the barrel index.ts, so the directive is needed: no finding.

export async function save(value: number): Promise<number> {
  return value + 1;
}
