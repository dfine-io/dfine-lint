// await-non-thenable — flags await on values without a `then` method. Skips any/unknown.
export async function f() {
  // POSITIVE: await on number literal
  const a = await 1; // EXPECT: await-non-thenable

  // POSITIVE: await on string
  const b = await "x"; // EXPECT: await-non-thenable

  // NEGATIVE: await on a real Promise
  const c = await Promise.resolve(1);

  // NEGATIVE: await on any (intentional escape hatch)
  const d: any = 1;
  const e = await d;

  return [a, b, c, e];
}
