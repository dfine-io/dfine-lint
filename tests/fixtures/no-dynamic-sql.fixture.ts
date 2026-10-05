// no-dynamic-sql — db.execute() with dynamic input; static string / sql`` allowed.
import { sql, sql as query } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { IMPORTED_TABLE, SHARED_QUERY } from "./no-dynamic-sql.helper";

declare const db: PgDatabase<PgQueryResultHKT>;
declare const userInput: string;

// POSITIVE: dynamic string concatenation in execute()
export async function dynamic() {
  await db.execute("SELECT * FROM t WHERE id = " + userInput); // EXPECT: no-dynamic-sql
}

// NEGATIVE: static string literal
export async function staticSql() {
  await db.execute("SELECT 1");
}

// NEGATIVE: drizzle's sql template parameterizes the input
export async function template() {
  await db.execute(sql`SELECT * FROM t WHERE id = ${userInput}`);
}

// NEGATIVE: an aliased sql tag is drizzle's sql all the same
export async function aliased() {
  await db.execute(query`SELECT * FROM t WHERE id = ${userInput}`);
}

// POSITIVE: a sql.raw() span splices the input unescaped
export async function rawSpan() {
  await db.execute(sql`SELECT * FROM t WHERE id = ${sql.raw(userInput)}`); // EXPECT: no-dynamic-sql
}

// NEGATIVE: a raw span with a literal is static SQL
export async function rawLiteral() {
  await db.execute(sql`SELECT * FROM ${sql.raw("t")}`);
}

// NEGATIVES: a literal, or a const (also imported) whose initializer is one
const TABLE = "users";
const TABLE_AS_CONST = "users" as const;
export async function rawConstant() {
  await db.execute(sql`SELECT * FROM ${sql.raw(TABLE)}`);
  await db.execute(sql`SELECT * FROM ${sql.raw(TABLE_AS_CONST)}`);
  await db.execute(sql`SELECT * FROM ${sql.raw(IMPORTED_TABLE)}`);
}

// POSITIVES: everything else, whatever its type says, one shape per line
const COLUMNS = { name: "name", created: "created_at" } as const;
enum Direction { Up = "ASC", Down = "DESC" }
let LET_TABLE = "users";
declare const AMBIENT_TABLE: "users";
declare function pickColumn(input: string): "name" | "created_at";
const PICKED = pickColumn("x") as "name";
export async function rawDynamic(sort: "name" | "created_at", newest: boolean, input: string) {
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(sort)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(COLUMNS.created)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY name ${sql.raw(Direction.Down)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM ${sql.raw(LET_TABLE)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM ${sql.raw(AMBIENT_TABLE)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(PICKED)}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(newest ? "created_at" : "name")}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(pickColumn(input) as "name")}`); // EXPECT: no-dynamic-sql
}
// A destructuring default applies only when the input lacks the key
export async function rawDestructured(body: { col?: "name" | "created_at" }) {
  const { col = "name" } = body;
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(col)}`); // EXPECT: no-dynamic-sql
}

// POSITIVES: a dynamic raw call anywhere in a span, or behind the variable a span names, one shape per line
export async function rawHidden(sort: string, on: boolean) {
  const orderBy = sql.raw(sort);
  await db.execute(sql`SELECT * FROM t ORDER BY ${orderBy}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ${sql`ORDER BY ${orderBy}`}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ${sql`ORDER BY ${sql.raw(sort)}`}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${sql.join([sql.raw(sort)])}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${on ? sql.raw(sort) : sql.raw("name")}`); // EXPECT: no-dynamic-sql
  await db.execute(sql`SELECT * FROM t ORDER BY ${(sql.raw(sort))}`); // EXPECT: no-dynamic-sql
  // @ts-expect-error: raw needs its text, and without one there is nothing static to check
  await db.execute(sql`SELECT * FROM ${sql.raw()}`); // EXPECT: no-dynamic-sql
}

// NEGATIVES: static raw text through a variable or a cast, other drizzle calls, and values in a span
declare const helper: { raw(text: string): string };
export async function spanClean(on: boolean) {
  const direction = sql.raw("DESC");
  await db.execute(sql`SELECT * FROM t ORDER BY name ${direction}`);
  await db.execute(sql`SELECT * FROM ${sql.raw("users" as const)}`);
  await db.execute(sql`SELECT * FROM t WHERE ${sql.join([sql`a = 1`, sql`b = 2`], sql` AND `)}`);
  await db.execute(sql`SELECT * FROM t WHERE id = ${helper.raw(userInput)}`);
  await db.execute(sql`SELECT 1`);
  const query = sql`SELECT * FROM t WHERE id = ${userInput}`;
  query.append(sql` LIMIT 1`);
  void query.if(sql.raw(userInput));
  await db.execute(query);
  await db.execute(on ? sql`SELECT 1` : sql`SELECT 2`);
}

// POSITIVES: a query held in a let, extended with a dynamic raw span, imported, or a loop variable
declare const queries: SQL[];
export async function heldQuery(sort: string) {
  let held = sql`SELECT * FROM t`;
  held = sql`SELECT * FROM t ORDER BY ${sql.raw(sort)}`;
  await db.execute(held); // EXPECT: no-dynamic-sql
  const grown = sql`SELECT * FROM t`;
  grown.append(sql` ORDER BY ${sql.raw(sort)}`);
  await db.execute(grown); // EXPECT: no-dynamic-sql
  const other = sql`SELECT 2`;
  await db.execute(other);
  await db.execute(SHARED_QUERY); // EXPECT: no-dynamic-sql
  for (const each of queries) await db.execute(each); // EXPECT: no-dynamic-sql
  const plain = "SELECT * FROM t WHERE id = " + sort;
  await db.execute(plain); // EXPECT: no-dynamic-sql
}

// NEGATIVE, no crash: a template naming itself is followed one level, not forever
// @ts-expect-error: used before its declaration, on purpose
const selfRef = sql`SELECT ${selfRef}`;
export async function selfReference() {
  await db.execute(sql`SELECT * FROM t WHERE ${selfRef}`);
}

// POSITIVE: a project function named sql is no drizzle template
export async function lookalikeTag() {
  function sql(parts: TemplateStringsArray, ...values: unknown[]): string {
    return parts.join(String(values[0]));
  }
  await db.execute(sql`SELECT * FROM t WHERE id = ${userInput}`); // EXPECT: no-dynamic-sql
}

// POSITIVE: dynamic SQL through a db handle held in a context object
declare const ctx: { db: typeof db };
export async function ctxDynamic() {
  await ctx.db.execute("SELECT * FROM t WHERE id = " + userInput); // EXPECT: no-dynamic-sql
}

// NEGATIVE: a handle with drizzle's method names that drizzle-orm does not declare
interface DbMock {
  select(...a: unknown[]): Promise<unknown[]>;
  insert(t: unknown): Promise<unknown>;
  update(t: unknown): Promise<unknown>;
  delete(t: unknown): Promise<unknown>;
  execute(query: unknown): Promise<unknown>;
}
declare const mock: DbMock;
export async function mockDynamic() {
  await mock.execute("SELECT * FROM t WHERE id = " + userInput);
}
