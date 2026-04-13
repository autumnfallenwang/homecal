import { describe, expect, it } from "vitest";
import { generateTempPassword, TEMP_PASSWORD_ALPHABET } from "../../src/services/temp-password.js";

describe("generateTempPassword", () => {
  it("returns a 14-character password by default", () => {
    expect(generateTempPassword()).toHaveLength(14);
  });

  it("respects the requested length", () => {
    expect(generateTempPassword(8)).toHaveLength(8);
    expect(generateTempPassword(32)).toHaveLength(32);
  });

  it("only uses characters from the readable alphabet", () => {
    const pw = generateTempPassword(200);
    for (const ch of pw) {
      expect(TEMP_PASSWORD_ALPHABET).toContain(ch);
    }
  });

  it("never includes ambiguous characters (0/O/1/l/I)", () => {
    const pw = generateTempPassword(500);
    expect(pw).not.toMatch(/[0O1lI]/);
  });

  it("produces distinct output across calls (statistical)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(generateTempPassword());
    }
    // With 14 chars from a 56-char alphabet we expect ~56^14 unique values;
    // a collision over 50 samples would be astronomically unlikely.
    expect(set.size).toBe(50);
  });

  it("throws on non-positive length", () => {
    expect(() => generateTempPassword(0)).toThrow();
    expect(() => generateTempPassword(-1)).toThrow();
  });
});
