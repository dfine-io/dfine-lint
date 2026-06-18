// no-page-params-unsafe-parse — Schema.parse() on Next.js Page params crashes on bad URL.
import { z } from "zod";

const IdSchema = z.string();

export default function Page({ params }: { params: { id: string } }) {
  const id = IdSchema.parse(params.id); // EXPECT: no-page-params-unsafe-parse
  const fixed = IdSchema.parse("static-not-from-params"); // NEGATIVE: not params-derived
  return id + fixed;
}
