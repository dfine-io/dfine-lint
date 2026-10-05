// effect-cleanup with a cleanupMap option whose value is one name, not a list
import { useEffect } from "react";
export function useLeak(): void {
  useEffect(() => { // EXPECT: effect-cleanup
    window.addEventListener("resize", () => undefined);
  }, []);
}
