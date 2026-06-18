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
