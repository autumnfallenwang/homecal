import { randomBytes } from "node:crypto";

/**
 * Readable alphabet for generated temp passwords: no characters that look alike
 * (0/O/o, 1/l/I) so an admin can dictate them without confusion.
 */
// biome-ignore lint/security/noSecrets: readable character set, not a secret
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DEFAULT_LENGTH = 14;

/**
 * Generate a crypto-random readable temp password. Uses rejection sampling over
 * `randomBytes` so every character is drawn from `ALPHABET` with uniform
 * probability.
 */
export function generateTempPassword(length = DEFAULT_LENGTH): string {
  if (length <= 0) throw new Error("length must be positive");
  const out: string[] = [];
  while (out.length < length) {
    // Oversample to reduce the number of syscalls; bytes >= 256 - (256 % alphabet.length)
    // are rejected to avoid modulo bias.
    const needed = length - out.length;
    const buf = randomBytes(needed * 2);
    const bias = 256 - (256 % ALPHABET.length);
    for (const byte of buf) {
      if (byte >= bias) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export const TEMP_PASSWORD_ALPHABET = ALPHABET;
