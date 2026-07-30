import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

// Format: scrypt$<saltHex>$<hashHex> — self-describing so we can rotate
// algorithms later without breaking existing stored hashes.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;

  const hash = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(password, salt, KEY_LEN);

  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(candidate, hash);
}
