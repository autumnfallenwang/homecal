import { parsedEventSchema, parseEventInputSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";
import { buildParsePrompt, parseLlmResponse } from "../../src/services/llm.js";

describe("parseEventInputSchema", () => {
  it("accepts valid text", () => {
    const result = parseEventInputSchema.safeParse({ text: "Dentist next Tuesday 2pm" });
    expect(result.success).toBe(true);
  });

  it("rejects empty text", () => {
    const result = parseEventInputSchema.safeParse({ text: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing text", () => {
    const result = parseEventInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects text exceeding 500 characters", () => {
    const result = parseEventInputSchema.safeParse({ text: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe("parsedEventSchema", () => {
  it("accepts valid event data", () => {
    const result = parsedEventSchema.safeParse({
      title: "Dentist",
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid datetime", () => {
    const result = parsedEventSchema.safeParse({
      title: "Dentist",
      start: "not-a-date",
      end: "2026-03-10T15:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = parsedEventSchema.safeParse({
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildParsePrompt", () => {
  it("includes the date", () => {
    const prompt = buildParsePrompt("2026-03-09");
    expect(prompt).toContain("2026-03-09");
  });

  it("includes day of week", () => {
    const prompt = buildParsePrompt("2026-03-09");
    expect(prompt).toContain("Sunday");
  });

  it("includes JSON instruction", () => {
    const prompt = buildParsePrompt("2026-03-09");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("title");
    expect(prompt).toContain("start");
    expect(prompt).toContain("end");
  });

  it("instructs UTC format with Z suffix", () => {
    const prompt = buildParsePrompt("2026-03-09");
    expect(prompt).toContain("00Z");
  });
});

describe("parseLlmResponse", () => {
  const validJson = JSON.stringify({
    title: "Dentist",
    start: "2026-03-10T14:00:00Z",
    end: "2026-03-10T15:00:00Z",
  });

  it("parses valid JSON", () => {
    const result = parseLlmResponse(validJson);
    expect(result.title).toBe("Dentist");
    expect(result.start).toBe("2026-03-10T14:00:00Z");
    expect(result.end).toBe("2026-03-10T15:00:00Z");
  });

  it("handles markdown code fences", () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parseLlmResponse(wrapped);
    expect(result.title).toBe("Dentist");
  });

  it("handles code fences without language tag", () => {
    const wrapped = `\`\`\`\n${validJson}\n\`\`\``;
    const result = parseLlmResponse(wrapped);
    expect(result.title).toBe("Dentist");
  });

  it("handles whitespace around JSON", () => {
    const result = parseLlmResponse(`  \n${validJson}\n  `);
    expect(result.title).toBe("Dentist");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLlmResponse("not json at all")).toThrow("Invalid JSON");
  });

  it("throws on missing fields", () => {
    expect(() => parseLlmResponse(JSON.stringify({ title: "Dentist" }))).toThrow(
      "Invalid event data",
    );
  });

  it("throws on invalid datetime", () => {
    expect(() =>
      parseLlmResponse(
        JSON.stringify({
          title: "Dentist",
          start: "bad-date",
          end: "2026-03-10T15:00:00Z",
        }),
      ),
    ).toThrow("Invalid event data");
  });

  it("strips extra fields", () => {
    const withExtra = JSON.stringify({
      title: "Dentist",
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
      location: "123 Main St",
    });
    const result = parseLlmResponse(withExtra);
    expect(result).toEqual({
      title: "Dentist",
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
    });
    expect("location" in result).toBe(false);
  });
});
