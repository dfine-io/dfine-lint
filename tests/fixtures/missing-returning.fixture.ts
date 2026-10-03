"use server";
// missing-returning — assigned db.insert/update without .returning(). "use server" only.
interface DbChain extends Promise<unknown[]> {
  values(v: unknown): DbChain;
  set(v: unknown): DbChain;
  where(c: unknown): DbChain;
  from(t: unknown): DbChain;
  returning(): Promise<unknown[]>;
}
interface DbMock {
  select(...a: unknown[]): DbChain;
  insert(t: unknown): DbChain;
  update(t: unknown): DbChain;
  delete(t: unknown): DbChain;
}
declare const db: DbMock;
declare const table: unknown;

// POSITIVE: assigned chained insert without .returning()
export async function insertNoReturning() {
  const row = await db.insert(table).values({}); // EXPECT: missing-returning
  return row;
}

// NEGATIVE: chained insert WITH .returning()
export async function insertOk() {
  const row = await db.insert(table).values({}).returning();
  return row;
}

// NEGATIVE: select is not a mutation
export async function selectOk() {
  const rows = await db.select();
  return rows;
}

// NEGATIVE: void insert (result not consumed)
export async function insertVoid() {
  await db.insert(table).values({});
}

// POSITIVE: insert through a db handle held in a context object
declare const ctx: { db: DbMock };
export async function ctxInsertNoReturning() {
  const row = await ctx.db.insert(table).values({}); // EXPECT: missing-returning
  return row;
}

// NEGATIVE: a query builder returned by a call is no db handle, even with insert/update methods
interface BuilderClient { from(name: string): DbMock }
declare const client: BuilderClient;
export async function builderInsert() {
  const row = await client.from("t").insert(table).values({});
  return row;
}
