// css-class-existence — styles.X must exist in the typed CSS module (see css-modules.d.ts). .tsx-only.
import styles from "./demo.module.css";

// POSITIVE: class not present in the module type
export const a = styles.missing; // EXPECT: css-class-existence

// NEGATIVE: class present in the module type
export const b = styles.container;
