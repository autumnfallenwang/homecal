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

export const parseEventInputSchema = z.object({
  text: z.string().min(1).max(500),
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

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventQuery = z.infer<typeof eventQuerySchema>;
export type ParseEventInput = z.infer<typeof parseEventInputSchema>;
export type ParseImageInput = z.infer<typeof parseImageInputSchema>;
export type ParsedEvent = z.infer<typeof parsedEventSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
