import { createDeviceSchema, deviceStatusFor, updateDeviceSchema } from "@homecal/shared";
import { describe, expect, it } from "vitest";
import { resolveSettings } from "../../src/services/household-devices.js";

const NOW = new Date("2026-11-10T15:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe("deviceStatusFor", () => {
  it("is 'never' before the first check-in, so a new device raises no alert", () => {
    expect(deviceStatusFor(null, 5, NOW)).toBe("never");
  });

  it("is online within half the threshold, stale after it, offline past the threshold", () => {
    expect(deviceStatusFor(minutesAgo(1), 5, NOW)).toBe("online");
    expect(deviceStatusFor(minutesAgo(3), 5, NOW)).toBe("stale");
    expect(deviceStatusFor(minutesAgo(6), 5, NOW)).toBe("offline");
  });

  it("uses the device's own threshold (the Kindle's 30 min vs a speaker's 5)", () => {
    expect(deviceStatusFor(minutesAgo(12), 30, NOW)).toBe("online");
    expect(deviceStatusFor(minutesAgo(12), 5, NOW)).toBe("offline");
  });

  it("accepts ISO strings as well as Dates", () => {
    expect(deviceStatusFor(minutesAgo(1).toISOString(), 5, NOW)).toBe("online");
  });
});

describe("resolveSettings", () => {
  it("fills a new speaker with defaults (English, quiet hours off)", () => {
    const r = resolveSettings("speaker", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings).toMatchObject({
        language: "en",
        quietHours: { enabled: false },
        agentVersion: null,
      });
    }
  });

  it("merges a partial volume patch without dropping the other stream", () => {
    const r = resolveSettings(
      "speaker",
      { volumes: { alarm: 9, music: 4 } },
      { volumes: { alarm: 12 } },
    );
    expect(r.ok && r.settings).toMatchObject({ volumes: { alarm: 12, music: 4 } });
  });

  it("rejects an out-of-range volume", () => {
    const r = resolveSettings("speaker", {}, { volumes: { alarm: 40 } });
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed quiet-hours time", () => {
    const r = resolveSettings("speaker", {}, { quietHours: { start: "9pm" } });
    expect(r.ok).toBe(false);
  });

  it("validates display settings separately from speaker settings", () => {
    expect(resolveSettings("display", {}, { refreshSeconds: 300 }).ok).toBe(true);
    expect(resolveSettings("display", {}, { refreshSeconds: 99999 }).ok).toBe(false);
  });
});

describe("device input schemas", () => {
  it("requires a known kind", () => {
    expect(createDeviceSchema.safeParse({ kind: "toaster", name: "x" }).success).toBe(false);
    expect(createDeviceSchema.safeParse({ kind: "speaker", name: "Kids' room" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name and an empty patch", () => {
    expect(createDeviceSchema.safeParse({ kind: "display", name: "  " }).success).toBe(false);
    expect(updateDeviceSchema.safeParse({}).success).toBe(false);
  });
});
