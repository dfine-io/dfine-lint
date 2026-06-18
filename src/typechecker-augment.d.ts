import "typescript";

declare module "typescript" {
  interface TypeChecker {
    /** Structural type assignability check. Internal API, stable since TS 4.0. */
    isTypeAssignableTo(source: Type, target: Type): boolean;
  }
}
