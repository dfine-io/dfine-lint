// no-client-data-fetch — fetch('/api/...') in a Client Component. .tsx, not "use server".
// (axios subcheck omitted: axios isn't installed in the SDK test env; covered vs real code.)
import React from "react";
declare const id: string;

// POSITIVE: fetch('/api/...') string literal
export async function load() {
  await fetch("/api/data"); // EXPECT: no-client-data-fetch
}

// POSITIVE: fetch(`/api/${id}`) template
export async function loadOne() {
  await fetch(`/api/${id}`); // EXPECT: no-client-data-fetch
}

// NEGATIVE: external URL
export async function external() {
  await fetch("https://example.com/data");
}

void React;
