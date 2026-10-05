// rules-of-hooks: a package that also exports a function named use, which is not React's
declare module "hooks-lookalike" {
  export function use(value: unknown): unknown;
}
