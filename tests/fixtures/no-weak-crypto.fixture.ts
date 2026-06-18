// no-weak-crypto — md5/sha1 hashes are cryptographically broken.
import { createHash } from "crypto";
import * as crypto from "node:crypto";
import { createHash as digest } from "crypto";

// POSITIVE: md5 hash (named import)
export function h1(data: string) {
  return createHash("md5").update(data).digest("hex"); // EXPECT: no-weak-crypto
}

// POSITIVE: sha1 via namespace import (node:)
export function h2(data: string) {
  return crypto.createHash("sha1").update(data).digest("hex"); // EXPECT: no-weak-crypto
}

// POSITIVE: uppercase algorithm is matched case-insensitively
export function h3(data: string) {
  return createHash("SHA1").update(data).digest("hex"); // EXPECT: no-weak-crypto
}

// POSITIVE: aliased createHash resolves to crypto.createHash
export function h4(data: string) {
  return digest("md4").update(data).digest("hex"); // EXPECT: no-weak-crypto
}

// NEGATIVE: strong hash algorithm
export function ok(data: string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
