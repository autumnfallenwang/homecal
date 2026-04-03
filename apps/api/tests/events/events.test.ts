import { createEventSchema, eventQuerySchema, updateEventSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";

describe("createEventSchema", () => {
  const validEvent = {
    title: "Dinner",
    start: "2026-03-01T18:00:00Z",
    end: "2026-03-01T20:00:00Z",
  };

  it("accepts valid event data", () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Dinner");
      expect(result.data.private).toBe(false); // default
    }
  });

  it("defaults private to false", () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private).toBe(false);
    }
  });

  it("accepts explicit private flag", () => {
    const result = createEventSchema.safeParse({ ...validEvent, private: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private).toBe(true);
    }
  });

  it("rejects missing title", () => {
    const result = createEventSchema.safeParse({
      start: "2026-03-01T18:00:00Z",
      end: "2026-03-01T20:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = createEventSchema.safeParse({ ...validEvent, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 200 characters", () => {
    const result = createEventSchema.safeParse({ ...validEvent, title: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects missing start", () => {
    const result = createEventSchema.safeParse({
      title: "Dinner",
      end: "2026-03-01T20:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing end", () => {
    const result = createEventSchema.safeParse({
      title: "Dinner",
      start: "2026-03-01T18:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime format", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      start: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const result = createEventSchema.safeParse({ ...validEvent, ownerId: "hacker" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("ownerId" in result.data).toBe(false);
    }
  });

  it("rejects non-boolean private", () => {
    const result = createEventSchema.safeParse({ ...validEvent, private: "yes" });
    expect(result.success).toBe(false);
  });

  it("accepts assigneeIds as array of UUIDs", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assigneeIds).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
    }
  });

  it("accepts missing assigneeIds (optional)", () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assigneeIds).toBeUndefined();
    }
  });

  it("rejects non-UUID strings in assigneeIds", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      assigneeIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional location and description", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      location: "Main St Clinic",
      description: "Annual checkup",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("Main St Clinic");
      expect(result.data.description).toBe("Annual checkup");
    }
  });

  it("accepts missing location and description", () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBeUndefined();
      expect(result.data.description).toBeUndefined();
    }
  });
});

describe("updateEventSchema", () => {
  it("accepts partial update with title only", () => {
    const result = updateEventSchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with start only", () => {
    const result = updateEventSchema.safeParse({ start: "2026-03-01T18:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with private only", () => {
    const result = updateEventSchema.safeParse({ private: true });
    expect(result.success).toBe(true);
  });

  it("accepts multiple fields", () => {
    const result = updateEventSchema.safeParse({
      title: "Updated",
      start: "2026-03-01T18:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateEventSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid title (empty string)", () => {
    const result = updateEventSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime", () => {
    const result = updateEventSchema.safeParse({ start: "bad-date" });
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const result = updateEventSchema.safeParse({ title: "Updated", ownerId: "hacker" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("ownerId" in result.data).toBe(false);
    }
  });

  it("accepts assigneeIds alone", () => {
    const result = updateEventSchema.safeParse({
      assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts assigneeIds with other fields", () => {
    const result = updateEventSchema.safeParse({
      title: "Updated",
      assigneeIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });
});

describe("eventQuerySchema", () => {
  it("accepts empty query", () => {
    const result = eventQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts from only", () => {
    const result = eventQuerySchema.safeParse({ from: "2026-03-01T00:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("accepts to only", () => {
    const result = eventQuerySchema.safeParse({ to: "2026-03-31T23:59:59Z" });
    expect(result.success).toBe(true);
  });

  it("accepts both from and to", () => {
    const result = eventQuerySchema.safeParse({
      from: "2026-03-01T00:00:00Z",
      to: "2026-03-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid from date", () => {
    const result = eventQuerySchema.safeParse({ from: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid to date", () => {
    const result = eventQuerySchema.safeParse({ to: "not-a-date" });
    expect(result.success).toBe(false);
  });
});
