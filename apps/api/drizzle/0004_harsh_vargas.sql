ALTER TABLE "event_reminders" DROP CONSTRAINT "event_reminders_event_minutes_unique";--> statement-breakpoint
ALTER TABLE "event_reminders" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_minutes_channel_unique" UNIQUE("eventId","minutesBefore","channel");