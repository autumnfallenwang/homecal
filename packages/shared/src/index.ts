import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  private: z.boolean().optional().default(false),
  seriesId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    location: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
    start: z.iso.datetime().optional(),
    end: z.iso.datetime().optional(),
    private: z.boolean().optional(),
    assigneeIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export const eventQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

// IANA timezone format — "UTC", "America/Los_Angeles", "Pacific/Kiritimati", etc.
// Runtime validation happens via Intl.DateTimeFormat which throws on unknown zones;
// this regex just blocks obviously malformed input.
const IANA_TZ_REGEX = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z][A-Za-z0-9_+-]*)*$/;

export const todayQuerySchema = z.object({
  tz: z.string().min(1).max(64).regex(IANA_TZ_REGEX, "Invalid IANA timezone"),
  userIds: z.string().max(4096).optional(),
});

export const parseEventInputSchema = z.object({
  text: z.string().min(1).max(500),
});

export const importIcsSchema = z.object({
  icsData: z.string().min(1).max(5_000_000), // ~5MB text limit
});

export const parseImageInputSchema = z.object({
  image: z.string().min(1).max(15_000_000), // ~10MB base64
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
});

export const parsedEventSchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().optional().default(""),
  description: z.string().optional().default(""),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  assignees: z.array(z.string()).optional().default([]),
});

// Reminders
export const createReminderSchema = z.object({
  minutesBefore: z.number().int().positive().max(10080), // max 1 week
  channel: z.enum(["email", "push"]).optional().default("email"),
});

// Device tokens
export const registerDeviceSchema = z.object({
  platform: z.enum(["ios", "web"]),
  token: z.string().min(1).max(4096),
});

// Admin API keys (Phase 16 task 70) — for service-to-service auth.
export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(32),
  userId: z.string().uuid(),
  prefix: z.string().max(16).optional(),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

// Service accounts (Phase 17 task 74) — admin-managed machine identities
// that own API keys. Password is generated server-side and never returned.
export const createServiceAccountSchema = z.object({
  name: z.string().min(1).max(64),
  role: z.enum(["user", "admin"]).optional().default("user"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-char hex code like #c2410c")
    .optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventQuery = z.infer<typeof eventQuerySchema>;
export type TodayQuery = z.infer<typeof todayQuerySchema>;
export type ParseEventInput = z.infer<typeof parseEventInputSchema>;
export type ImportIcsInput = z.infer<typeof importIcsSchema>;
export type ParseImageInput = z.infer<typeof parseImageInputSchema>;
export type ParsedEvent = z.infer<typeof parsedEventSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;
export type CreateServiceAccountInput = z.infer<typeof createServiceAccountSchema>;
