"use server";
// missing-returning — assigned db.insert/update without .returning(). "use server" only.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

const users = pgTable("users", { id: serial("id").primaryKey(), name: text("name") });
declare const db: PgDatabase<PgQueryResultHKT>;

// POSITIVE: assigned chained insert without .returning()
export async function insertNoReturning() {
  const row = await db.insert(users).values({ name: "a" }); // EXPECT: missing-returning
  return row;
}

// NEGATIVE: chained insert WITH .returning()
export async function insertOk() {
  const row = await db.insert(users).values({ name: "a" }).returning();
  return row;
}

// NEGATIVE: select is not a mutation
export async function selectOk() {
  const rows = await db.select().from(users);
  return rows;
}

// NEGATIVE: void insert (result not consumed)
export async function insertVoid() {
  await db.insert(users).values({ name: "a" });
}

// POSITIVE: insert through a db handle held in a context object
declare const ctx: { db: typeof db };
export async function ctxInsertNoReturning() {
  const row = await ctx.db.insert(users).values({ name: "a" }); // EXPECT: missing-returning
  return row;
}

// NEGATIVE: a handle with the same methods that drizzle-orm does not declare
interface MockChain extends Promise<unknown[]> {
  values(v: unknown): MockChain;
  returning(): Promise<unknown[]>;
}
interface DbMock {
  select(...a: unknown[]): MockChain;
  insert(t: unknown): MockChain;
  update(t: unknown): MockChain;
  delete(t: unknown): MockChain;
}
declare const mock: DbMock;
export async function mockInsert() {
  const row = await mock.insert(users).values({});
  return row;
}

// NEGATIVE: a query builder returned by a call is no db handle, even with insert/update methods
interface BuilderClient { from(name: string): typeof db }
declare const client: BuilderClient;
export async function builderInsert() {
  const row = await client.from("t").insert(users).values({ name: "a" });
  return row;
}
