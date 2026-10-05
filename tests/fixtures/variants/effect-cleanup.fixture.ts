// effect-cleanup in a .ts file: a hook module without JSX is checked like a component file.
import { useEffect } from "react";

// POSITIVE: setInterval without clearInterval in a custom hook
export function usePolling(tick: () => void) {
  useEffect(() => { // EXPECT: effect-cleanup
    setInterval(tick, 1000);
  }, [tick]);
}
