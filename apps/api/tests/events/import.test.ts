import { importIcsSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";

describe("importIcsSchema", () => {
  it("accepts valid .ics text", () => {
    const result = importIcsSchema.safeParse({
      icsData: "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty icsData", () => {
    const result = importIcsSchema.safeParse({ icsData: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing icsData", () => {
    const result = importIcsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects oversized content", () => {
    const result = importIcsSchema.safeParse({ icsData: "x".repeat(5_000_001) });
    expect(result.success).toBe(false);
  });
});
