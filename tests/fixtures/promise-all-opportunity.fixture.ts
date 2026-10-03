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

// NEGATIVE: second await reads the first through a shorthand property
declare function getD(dep: { a: number }): Promise<number>;
export async function dependentShorthand() {
  const a = await getA();
  const d = await getD({ a });
  return d;
}

// NEGATIVE: second await reads the first through a property a shorthand created
declare function getE(dep: number): Promise<number>;
export async function dependentHolder() {
  const a = await getA();
  const e = await getE(holder().a);
  return e;
  function holder() {
    return { a };
  }
}

// NEGATIVE: second await depends on the first
export async function dependent() {
  const a = await getA();
  const c = await getC(a);
  return c;
}
