// effect-cleanup timing: nine mutually calling helpers; each body must be walked once per cleanup, not per path.
import { useEffect } from "react";
function h0(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h1(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h2(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h3(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h4(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h5(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h6(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h7(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
function h8(id: number, d: number): void { clearInterval(id); if (d > 0) { h0(id, d - 1); h1(id, d - 1); h2(id, d - 1); h3(id, d - 1); h4(id, d - 1); h5(id, d - 1); h6(id, d - 1); h7(id, d - 1); h8(id, d - 1); } }
export function E0() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => h0(id, 2); }, []); }
export function E1() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => h1(id, 2); }, []); }
export function E2() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => h2(id, 2); }, []); }
export function E3() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => h3(id, 2); }, []); }
export function E4() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => h4(id, 2); }, []); }
// A ladder: each helper calls the next twice, 2^20 paths; a helper's cleanups must stay a set, not a copied list
function l0(id: number): void { clearInterval(id); l1(id); l1(id); }
function l1(id: number): void { clearInterval(id); l2(id); l2(id); }
function l2(id: number): void { clearInterval(id); l3(id); l3(id); }
function l3(id: number): void { clearInterval(id); l4(id); l4(id); }
function l4(id: number): void { clearInterval(id); l5(id); l5(id); }
function l5(id: number): void { clearInterval(id); l6(id); l6(id); }
function l6(id: number): void { clearInterval(id); l7(id); l7(id); }
function l7(id: number): void { clearInterval(id); l8(id); l8(id); }
function l8(id: number): void { clearInterval(id); l9(id); l9(id); }
function l9(id: number): void { clearInterval(id); l10(id); l10(id); }
function l10(id: number): void { clearInterval(id); l11(id); l11(id); }
function l11(id: number): void { clearInterval(id); l12(id); l12(id); }
function l12(id: number): void { clearInterval(id); l13(id); l13(id); }
function l13(id: number): void { clearInterval(id); l14(id); l14(id); }
function l14(id: number): void { clearInterval(id); l15(id); l15(id); }
function l15(id: number): void { clearInterval(id); l16(id); l16(id); }
function l16(id: number): void { clearInterval(id); l17(id); l17(id); }
function l17(id: number): void { clearInterval(id); l18(id); l18(id); }
function l18(id: number): void { clearInterval(id); l19(id); l19(id); }
function l19(id: number): void { clearInterval(id); }
export function Ladder() { useEffect(() => { const id = window.setInterval(() => undefined, 9); return () => l0(id); }, []); }
