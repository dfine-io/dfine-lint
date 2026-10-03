// no-db-antipatterns — db.transaction() (Neon HTTP) + await db.* inside a loop (N+1).
interface DbChain extends Promise<unknown[]> {
  from(t: unknown): DbChain;
  where(c: unknown): DbChain;
  values(v: unknown): DbChain;
}
interface DbMock {
  select(...a: unknown[]): DbChain;
  insert(t: unknown): DbChain;
  update(t: unknown): DbChain;
  delete(t: unknown): DbChain;
  execute(sql: unknown): DbChain;
  transaction(fn: unknown): Promise<unknown>;
}
declare const db: DbMock;
declare const table: unknown;

// POSITIVE: db.transaction()
export async function tx() {
  await db.transaction(async () => undefined); // EXPECT: no-db-antipatterns
}

// POSITIVE: await db.* inside a loop (N+1)
export async function nPlusOne(ids: number[]) {
  for (const id of ids) {
    await db.select().from(table).where(id); // EXPECT: no-db-antipatterns
  }
}

// NEGATIVE: chunked multi-row insert in a loop — a deliberate batch (Neon param/subrequest limit),
// not per-row N+1. insert is excluded because inArray() batching only rewrites WHERE-clause ops.
export async function chunkedInsert(chunks: unknown[][]) {
  for (const chunk of chunks) {
    await db.insert(table).values(chunk);
  }
}

// NEGATIVE: single query outside any loop
export async function ok() {
  await db.select().from(table);
}

// POSITIVE: transaction on a db handle held in a context object
declare const ctx: { db: DbMock };
export async function ctxTx() {
  await ctx.db.transaction(async () => undefined); // EXPECT: no-db-antipatterns
}

// POSITIVE: N+1 through a class-held handle
export class Repo {
  constructor(private readonly db: DbMock) {}
  async load(ids: number[]) {
    for (const id of ids) {
      await this.db.select().from(table).where(id); // EXPECT: no-db-antipatterns
    }
  }
}

// NEGATIVE: the for-of iterable runs once, not per iteration
export async function iterableOnce() {
  for (const row of await db.select().from(table)) {
    void row;
  }
}
