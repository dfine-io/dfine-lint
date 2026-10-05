// no-page-params-unsafe-parse — Schema.parse() on Next.js Page params crashes on bad URL.
import { z } from "zod";

const IdSchema = z.string();
declare const lookalike: { parse(x: unknown): string; safeParse(x: unknown): unknown };

export default function Page({ params }: { params: { id: string } }) {
  const id = IdSchema.parse(params.id); // EXPECT: no-page-params-unsafe-parse
  const fixed = IdSchema.parse("static-not-from-params"); // NEGATIVE: not params-derived
  const pending = IdSchema.parseAsync(params.id); // EXPECT: no-page-params-unsafe-parse
  const viaFunction = z.parse(IdSchema, params.id); // EXPECT: no-page-params-unsafe-parse
  const viaLookalike = lookalike.parse(params.id); // NEGATIVE: no zod schema
  void pending;
  return id + fixed + viaFunction + viaLookalike;
}
