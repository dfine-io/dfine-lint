"use server";
// no-ssrf — fetch() with a parameter-derived URL in an exported Server Action.

// POSITIVE: URL derived from a function parameter
export async function proxy(url: string) {
  return fetch(url); // EXPECT: no-ssrf
}

// POSITIVE: parameter flowed through a local variable
export async function proxyIndirect(target: string) {
  const endpoint = target;
  return fetch(endpoint); // EXPECT: no-ssrf
}

// NEGATIVE: static literal URL
export async function fixed() {
  return fetch("https://api.example.com/data");
}

// POSITIVE: globalThis.fetch is the global fetch
export async function proxyGlobal(url: string) {
  return globalThis.fetch(url); // EXPECT: no-ssrf
}

// POSITIVE: a parameter's property, reached through a local variable
export async function proxyProperty(params: { url: string }) {
  const p = params;
  return fetch(p.url); // EXPECT: no-ssrf
}

// NEGATIVE: a local function named fetch is not the global fetch
export async function localFetch(url: string) {
  const fetch = async (u: string) => u;
  return fetch(url);
}
