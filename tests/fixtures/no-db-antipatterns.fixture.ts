// no-db-antipatterns — db.transaction() on drizzle's Neon HTTP driver + await db.* inside a loop (N+1).
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import { pgTable, serial } from "drizzle-orm/pg-core";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

const table = pgTable("t", { id: serial("id").primaryKey() });
const db = drizzle(neon("postgres://localhost/app"));
// A PgDatabase annotated with the Neon HTTP result kind is the Neon HTTP driver as well
declare const annotated: PgDatabase<NeonHttpQueryResultHKT>;
// node-postgres, neon-serverless and the other pg drivers support transactions
declare const pooled: PgDatabase<PgQueryResultHKT>;

// POSITIVE: db.transaction() on the Neon HTTP driver
export async function tx() {
  await db.transaction(async () => undefined); // EXPECT: no-db-antipatterns
}

// POSITIVE: transaction on a PgDatabase over NeonHttpQueryResultHKT
export async function annotatedTx() {
  await annotated.transaction(async () => undefined); // EXPECT: no-db-antipatterns
}

// NEGATIVE: transaction on a driver that supports it
export async function pooledTx() {
  await pooled.transaction(async () => undefined);
}

// POSITIVE: await db.* inside a loop (N+1)
export async function nPlusOne(ids: number[]) {
  for (const id of ids) {
    await db.select().from(table).where(eq(table.id, id)); // EXPECT: no-db-antipatterns
  }
}

// NEGATIVE: chunked multi-row insert in a loop — a deliberate batch (Neon param/subrequest limit),
// not per-row N+1. insert is excluded because inArray() batching only rewrites WHERE-clause ops.
export async function chunkedInsert(chunks: { id: number }[][]) {
  for (const chunk of chunks) {
    await db.insert(table).values(chunk);
  }
}

// NEGATIVE: single query outside any loop
export async function ok() {
  await db.select().from(table);
}

// POSITIVE: transaction on a db handle held in a context object
declare const ctx: { db: typeof db };
export async function ctxTx() {
  await ctx.db.transaction(async () => undefined); // EXPECT: no-db-antipatterns
}

// POSITIVE: N+1 through a class-held handle
export class Repo {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT>) {}
  async load(ids: number[]) {
    for (const id of ids) {
      await this.db.select().from(table).where(eq(table.id, id)); // EXPECT: no-db-antipatterns
    }
  }
}

// NEGATIVE: the for-of iterable runs once, not per iteration
export async function iterableOnce() {
  for (const row of await db.select().from(table)) {
    void row;
  }
}

// NEGATIVE: a handle with drizzle's method names that drizzle-orm does not declare
interface MockChain extends Promise<unknown[]> {
  from(t: unknown): MockChain;
}
interface DbMock {
  select(...a: unknown[]): MockChain;
  insert(t: unknown): MockChain;
  update(t: unknown): MockChain;
  delete(t: unknown): MockChain;
  transaction(fn: unknown): Promise<unknown>;
}
declare const mock: DbMock;
export async function mockLoop(ids: number[]) {
  await mock.transaction(async () => undefined);
  for (const id of ids) {
    await mock.select(id).from(table);
  }
}
