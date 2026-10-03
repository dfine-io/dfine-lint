// restrict-template-expr — only primitives / own-toString allowed in `${}`.
declare const obj: { a: number };
declare const n: number;

// POSITIVE: plain object interpolated
export const a = `value: ${obj}`; // EXPECT: restrict-template-expr

// POSITIVE: a package type without its own toString() prints [object Object] as well
declare const tsNode: import("typescript").Node;
export const fromPackage = `node: ${tsNode}`; // EXPECT: restrict-template-expr

// NEGATIVE: a tagged template hands the value to its tag, nothing is stringified
declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;
export const query = sql`select ${obj}`;

// POSITIVE: String.raw returns a string and stringifies its substitutions
export const raw = String.raw`value: ${obj}`; // EXPECT: restrict-template-expr
// POSITIVE: a tag returning a literal union of strings stringifies too
declare function pickTag(strings: TemplateStringsArray, ...values: unknown[]): "a" | "b";
export const picked = pickTag`value: ${obj}`; // EXPECT: restrict-template-expr
declare function idTag(strings: TemplateStringsArray, ...values: unknown[]): `id-${string}`;
export const ided = idTag`value: ${obj}`; // EXPECT: restrict-template-expr
declare function upTag(strings: TemplateStringsArray, ...values: unknown[]): Uppercase<string>;
export const upped = upTag`value: ${obj}`; // EXPECT: restrict-template-expr

// NEGATIVE: number is safe
export const b = `count: ${n}`;

// NEGATIVE: an intrinsic string mapping is a string
declare const upper: Uppercase<string>;
export const mapped = `name: ${upper}`;
