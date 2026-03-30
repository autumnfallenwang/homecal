import { createReminderSchema, registerDeviceSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";

describe("createReminderSchema", () => {
  it("accepts valid minutesBefore", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 15 }).success).toBe(true);
    expect(createReminderSchema.safeParse({ minutesBefore: 60 }).success).toBe(true);
    expect(createReminderSchema.safeParse({ minutesBefore: 1440 }).success).toBe(true);
  });

  it("rejects zero", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 0 }).success).toBe(false);
  });

  it("rejects negative", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: -5 }).success).toBe(false);
  });

  it("rejects non-integer", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 15.5 }).success).toBe(false);
  });

  it("rejects > 10080 (1 week)", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 10081 }).success).toBe(false);
  });

  it("accepts exactly 10080", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 10080 }).success).toBe(true);
  });

  it("defaults channel to email when omitted", () => {
    const result = createReminderSchema.safeParse({ minutesBefore: 15 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("email");
    }
  });

  it("accepts channel email", () => {
    const result = createReminderSchema.safeParse({ minutesBefore: 15, channel: "email" });
    expect(result.success).toBe(true);
  });

  it("accepts channel push", () => {
    const result = createReminderSchema.safeParse({ minutesBefore: 15, channel: "push" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid channel", () => {
    expect(createReminderSchema.safeParse({ minutesBefore: 15, channel: "sms" }).success).toBe(
      false,
    );
  });
});

describe("registerDeviceSchema", () => {
  it("accepts valid ios device", () => {
    const result = registerDeviceSchema.safeParse({ platform: "ios", token: "abc123" });
    expect(result.success).toBe(true);
  });

  it("accepts valid web device", () => {
    const result = registerDeviceSchema.safeParse({ platform: "web", token: '{"endpoint":"..."}' });
    expect(result.success).toBe(true);
  });

  it("rejects invalid platform", () => {
    expect(registerDeviceSchema.safeParse({ platform: "android", token: "abc" }).success).toBe(
      false,
    );
  });

  it("rejects empty token", () => {
    expect(registerDeviceSchema.safeParse({ platform: "ios", token: "" }).success).toBe(false);
  });

  it("rejects missing token", () => {
    expect(registerDeviceSchema.safeParse({ platform: "ios" }).success).toBe(false);
  });

  it("rejects missing platform", () => {
    expect(registerDeviceSchema.safeParse({ token: "abc" }).success).toBe(false);
  });
});
