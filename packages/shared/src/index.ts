import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  private: z.boolean().optional().default(false),
});

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    start: z.iso.datetime().optional(),
    end: z.iso.datetime().optional(),
    private: z.boolean().optional(),
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

export const parsedEventSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventQuery = z.infer<typeof eventQuerySchema>;
export type ParseEventInput = z.infer<typeof parseEventInputSchema>;
export type ParsedEvent = z.infer<typeof parsedEventSchema>;
