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
    const prompt = buildParsePrompt("2026-03-09", []);
    expect(prompt).toContain("2026-03-09");
  });

  it("includes day of week", () => {
    const prompt = buildParsePrompt("2026-03-09", []);
    expect(prompt).toContain("Sunday");
  });

  it("includes JSON instruction", () => {
    const prompt = buildParsePrompt("2026-03-09", []);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("title");
    expect(prompt).toContain("start");
    expect(prompt).toContain("end");
    expect(prompt).toContain("assignees");
  });

  it("instructs UTC format with Z suffix", () => {
    const prompt = buildParsePrompt("2026-03-09", []);
    expect(prompt).toContain("00Z");
  });

  it("includes family member names when provided", () => {
    const prompt = buildParsePrompt("2026-03-09", ["Dad", "Mom", "Kid"]);
    expect(prompt).toContain("Dad, Mom, Kid");
    expect(prompt).toContain("Family members");
  });

  it("omits family members line when empty", () => {
    const prompt = buildParsePrompt("2026-03-09", []);
    expect(prompt).not.toContain("Family members");
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
    expect(result.assigneeIds).toEqual([]);
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

  it("normalizes datetimes without Z suffix", () => {
    const noZ = JSON.stringify({
      title: "Dinner",
      start: "2026-03-29T19:00:00",
      end: "2026-03-29T20:00:00",
    });
    const result = parseLlmResponse(noZ);
    expect(result.start).toBe("2026-03-29T19:00:00Z");
    expect(result.end).toBe("2026-03-29T20:00:00Z");
  });

  it("normalizes datetimes without seconds", () => {
    const noSec = JSON.stringify({
      title: "Lunch",
      start: "2026-03-29T12:00",
      end: "2026-03-29T13:00",
    });
    const result = parseLlmResponse(noSec);
    expect(result.start).toBe("2026-03-29T12:00:00Z");
    expect(result.end).toBe("2026-03-29T13:00:00Z");
  });

  it("converts timezone offset to UTC", () => {
    const offset = JSON.stringify({
      title: "Call",
      start: "2026-03-29T14:00:00+00:00",
      end: "2026-03-29T15:00:00+00:00",
    });
    const result = parseLlmResponse(offset);
    expect(result.start).toBe("2026-03-29T14:00:00.000Z");
    expect(result.end).toBe("2026-03-29T15:00:00.000Z");
  });

  it("fixes end before start by defaulting to start + 1 hour", () => {
    const flipped = JSON.stringify({
      title: "Meeting",
      start: "2026-03-29T15:00:00Z",
      end: "2026-03-29T14:00:00Z",
    });
    const result = parseLlmResponse(flipped);
    expect(result.start).toBe("2026-03-29T15:00:00Z");
    expect(result.end).toBe("2026-03-29T16:00:00.000Z");
  });

  it("fixes end equal to start by defaulting to start + 1 hour", () => {
    const same = JSON.stringify({
      title: "Quick sync",
      start: "2026-03-29T10:00:00Z",
      end: "2026-03-29T10:00:00Z",
    });
    const result = parseLlmResponse(same);
    expect(result.end).toBe("2026-03-29T11:00:00.000Z");
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
      assigneeIds: [],
    });
    expect("location" in result).toBe(false);
  });

  it("maps assignee names to IDs", () => {
    const json = JSON.stringify({
      title: "Kid's dentist",
      start: "2026-03-10T14:00:00Z",
      end: "2026-03-10T15:00:00Z",
      assignees: ["Kid"],
    });
    const nameToId = new Map([
      ["Dad", "id-dad"],
      ["Kid", "id-kid"],
    ]);
    const result = parseLlmResponse(json, nameToId);
    expect(result.assigneeIds).toEqual(["id-kid"]);
  });

  it("maps assignee names case-insensitively", () => {
    const json = JSON.stringify({
      title: "Dinner",
      start: "2026-03-10T18:00:00Z",
      end: "2026-03-10T20:00:00Z",
      assignees: ["dad", "MOM"],
    });
    const nameToId = new Map([
      ["Dad", "id-dad"],
      ["Mom", "id-mom"],
    ]);
    const result = parseLlmResponse(json, nameToId);
    expect(result.assigneeIds).toEqual(["id-dad", "id-mom"]);
  });

  it("ignores unrecognized assignee names", () => {
    const json = JSON.stringify({
      title: "Meeting",
      start: "2026-03-10T10:00:00Z",
      end: "2026-03-10T11:00:00Z",
      assignees: ["Unknown Person"],
    });
    const nameToId = new Map([["Dad", "id-dad"]]);
    const result = parseLlmResponse(json, nameToId);
    expect(result.assigneeIds).toEqual([]);
  });
});
