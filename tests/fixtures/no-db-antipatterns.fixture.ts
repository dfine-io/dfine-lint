// no-db-antipatterns — db.transaction() (Neon HTTP) + await db.* inside a loop (N+1).
interface DbChain extends Promise<unknown[]> {
  from(t: unknown): DbChain;
  where(c: unknown): DbChain;
}
interface DbMock {
  select(...a: unknown[]): DbChain;
  insert(t: unknown): DbChain;
  update(t: unknown): DbChain;
  delete(t: unknown): DbChain;
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

// NEGATIVE: single query outside any loop
export async function ok() {
  await db.select().from(table);
}
