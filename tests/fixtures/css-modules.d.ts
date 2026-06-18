// Ambient typed CSS-module declaration for the css-class-existence fixture.
// Standalone .d.ts (no top-level import/export) → ambient wildcard module, not augmentation.
declare module "*.module.css" {
  const styles: { readonly container: string };
  export default styles;
}
