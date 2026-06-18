// effect-cleanup — useEffect with a setup call must return a matching cleanup. .tsx-only.
import { useEffect } from "react";

// POSITIVE: addEventListener without removeEventListener cleanup
export function Bad1() {
  useEffect(() => { // EXPECT: effect-cleanup
    window.addEventListener("resize", () => undefined);
  }, []);
}

// POSITIVE: setInterval without clearInterval cleanup
export function Bad2() {
  useEffect(() => { // EXPECT: effect-cleanup
    setInterval(() => undefined, 1000);
  }, []);
}

// NEGATIVE: addEventListener WITH matching cleanup in return
export function Good1() {
  useEffect(() => {
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
}

// NEGATIVE: no setup call → nothing to clean up
export function Good2() {
  useEffect(() => {
    void document.title;
  }, []);
}
