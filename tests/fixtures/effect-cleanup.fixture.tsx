// effect-cleanup — useEffect with a setup call must return a matching cleanup (a .ts twin is in variants/).
import { useEffect, useLayoutEffect } from "react";

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

// NEGATIVE: observe() undone by unobserve()
export function Observe() {
  useEffect(() => {
    const observer = new ResizeObserver(() => undefined);
    observer.observe(document.body);
    return () => observer.unobserve(document.body);
  }, []);
}

// NEGATIVE: on() undone by removeListener()
declare const emitter: import("node:events").EventEmitter;
export function Emitter() {
  useEffect(() => {
    const handler = () => undefined;
    emitter.on("tick", handler);
    return () => {
      emitter.removeListener("tick", handler);
    };
  }, []);
}

// NEGATIVE: a project helper runs the cleanup
function detach(handler: () => void) {
  window.removeEventListener("resize", handler);
}
export function Helper() {
  useEffect(() => {
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    return () => detach(handler);
  }, []);
}

// NEGATIVE: the helper takes its target as a parameter; the caller passes window
function detachFrom(target: EventTarget, handler: () => void) {
  target.removeEventListener("resize", handler);
}
export function HelperTarget() {
  useEffect(() => {
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    return () => detachFrom(window, handler);
  }, []);
}

// NEGATIVE, the declared gap: a helper's receiver is unknown, so the leaked document listener passes
export function HelperOneTarget() {
  useEffect(() => {
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    document.addEventListener("resize", handler);
    return () => detachFrom(window, handler);
  }, []);
}

// POSITIVE: a project function that only shares the API's name undoes nothing
export function LookalikeClear() {
  function clearInterval(id: number): void {
    void id;
  }
  useEffect(() => { // EXPECT: effect-cleanup
    const id = window.setInterval(() => undefined, 1000);
    return () => clearInterval(id);
  }, []);
}

// POSITIVE: a cleanup returned by a nested function is not the effect's cleanup
export function NestedReturn() {
  useEffect(() => { // EXPECT: effect-cleanup
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    const later = () => {
      return () => window.removeEventListener("resize", handler);
    };
    void later;
  }, []);
}

// POSITIVE: two leaked listeners of one method are one finding
export function TwoLeaks() {
  useEffect(() => { // EXPECT: effect-cleanup
    window.addEventListener("resize", () => undefined);
    window.addEventListener("scroll", () => undefined);
  }, []);
}

// NEGATIVE: a project hook named useEffect is not React's
export function LookalikeEffect() {
  const local = { useEffect: (run: () => void) => run() };
  local.useEffect(() => {
    window.addEventListener("resize", () => undefined);
  });
}

// NEGATIVE: a bare setInterval is undone by window.clearInterval
export function BareSetup() {
  useEffect(() => {
    const id = setInterval(() => undefined, 1000);
    return () => window.clearInterval(id);
  }, []);
}

// POSITIVE: useLayoutEffect is checked like useEffect
export function Layout() {
  useLayoutEffect(() => { // EXPECT: effect-cleanup
    window.addEventListener("resize", () => undefined);
  }, []);
}

// NEGATIVE: mutually recursive helpers; a walk cut short by the recursion must not be reused by the next effect
function outerStop(id: number, handler: () => void, again: boolean): void {
  clearInterval(id);
  if (again) innerStop(id, handler, false);
}
function innerStop(id: number, handler: () => void, again: boolean): void {
  if (again) outerStop(id, handler, false);
  window.removeEventListener("scroll", handler);
}
export function RecursiveFirst() {
  useEffect(() => {
    const handler = () => undefined;
    const id = window.setInterval(handler, 1000);
    window.addEventListener("scroll", handler);
    return () => outerStop(id, handler, true);
  }, []);
}
export function RecursiveSecond() {
  useEffect(() => {
    const id = window.setInterval(() => undefined, 1000);
    return () => innerStop(id, () => undefined, true);
  }, []);
}

// NEGATIVE: a three-helper cycle; the effect entering at stopB still sees stopA's clearInterval
function stopA(id: number, handler: () => void, depth: number): void {
  clearInterval(id);
  if (depth > 0) stopB(id, handler, depth - 1);
}
function stopB(id: number, handler: () => void, depth: number): void {
  if (depth > 0) stopC(id, handler, depth - 1);
}
function stopC(id: number, handler: () => void, depth: number): void {
  window.removeEventListener("scroll", handler);
  if (depth > 0) stopA(id, handler, depth - 1);
}
function stopViaB(id: number, handler: () => void): void {
  stopB(id, handler, 3);
}
export function CycleFirst() {
  useEffect(() => {
    const handler = () => undefined;
    const id = window.setInterval(handler, 1000);
    window.addEventListener("scroll", handler);
    return () => {
      stopA(id, handler, 3);
      stopViaB(id, handler);
    };
  }, []);
}
// NEGATIVE: stopViaB reused a partial stopB within CycleFirst's walk, so it must not be cached for this effect
export function CycleThird() {
  useEffect(() => {
    const id = window.setInterval(() => undefined, 1000);
    return () => stopViaB(id, () => undefined);
  }, []);
}
export function CycleSecond() {
  useEffect(() => {
    const id = window.setInterval(() => undefined, 1000);
    return () => stopB(id, () => undefined, 3);
  }, []);
}

// NEGATIVE: window.setTimeout undone by a bare clearTimeout(id)
export function Timer() {
  useEffect(() => {
    const id = window.setTimeout(() => undefined, 100);
    return () => clearTimeout(id);
  }, []);
}

// POSITIVE: the cleanup removes the listener from another receiver
export function OtherReceiver() {
  useEffect(() => { // EXPECT: effect-cleanup
    const handler = () => undefined;
    window.addEventListener("resize", handler);
    return () => document.removeEventListener("resize", handler);
  }, []);
}
