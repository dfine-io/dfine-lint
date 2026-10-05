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

// POSITIVE: two reads of one id share an argument, but both results are used: they can run together
declare function getUser(id: string): Promise<{ name: string }>;
declare function getPosts(id: string): Promise<string[]>;
export async function profile(id: string) {
  const user = await getUser(id);
  const posts = await getPosts(id); // EXPECT: promise-all-opportunity
  return { user, posts };
}

// POSITIVE: a variable declared earlier in the block is no dependency between the two awaits
export async function earlierVariable() {
  const base = 1;
  const a = await getA();
  const c = await getC(base); // EXPECT: promise-all-opportunity
  return a + c;
}

// NEGATIVE: a bare await writes, the next await reads what it was given (update, then sync)
declare const billing: { update(id: string, data: object): Promise<void> };
declare function syncAfterMutation(id: string): Promise<void>;
export async function updateThenSync(subscriptionId: string) {
  await billing.update(subscriptionId, { plan: "pro" });
  await syncAfterMutation(subscriptionId);
}

// NEGATIVE: a readiness await on a value, then the work on that value
declare function waitUntilReady(img: object): Promise<void>;
declare function decode(img: object): Promise<object>;
export async function readyThenDecode(img: object) {
  await waitUntilReady(img);
  return await decode(img);
}

// NEGATIVE: the same receiver (this.db) written, then read
interface Store { insert(row: object): Promise<void>; select(): Promise<object[]> }
export class Repo {
  constructor(private readonly db: Store) {}
  async save(row: object) {
    await this.db.insert(row);
    await this.db.select();
  }
}

// NEGATIVE: the second await reads a name the first destructured
declare function getPair(): Promise<{ left: number }>;
export async function destructured() {
  const { left } = await getPair();
  const c = await getC(left);
  return c;
}

// POSITIVE: two destructured dynamic imports load independently
export async function lazyModules() {
  const { helperValue } = await import("./promise-all-opportunity.helper");
  const { pathToFileURL } = await import("node:url"); // EXPECT: promise-all-opportunity
  return pathToFileURL(helperValue);
}

// POSITIVE: a try around the outer function does not order the chain of a function inside it
export async function nestedInTry() {
  try {
    const run = async () => {
      const a = await getA();
      const b = await getB(); // EXPECT: promise-all-opportunity
      return a + b;
    };
    return await run();
  } catch {
    return 0;
  }
}
