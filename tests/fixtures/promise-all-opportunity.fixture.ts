// promise-all-opportunity — consecutive independent awaits could run via Promise.all.
declare function getA(): Promise<number>;
declare function getB(): Promise<number>;
declare function getC(dep: number): Promise<number>;

// POSITIVE: two independent awaits in sequence
export async function parallel() {
  const a = await getA();
  const b = await getB(); // EXPECT: promise-all-opportunity
  return a + b;
}

// NEGATIVE: second await depends on the first
export async function dependent() {
  const a = await getA();
  const c = await getC(a);
  return c;
}
