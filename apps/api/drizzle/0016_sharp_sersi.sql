CREATE TABLE "event_reminder_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminderId" uuid NOT NULL,
	"deviceId" uuid NOT NULL,
	CONSTRAINT "event_reminder_devices_reminder_device_unique" UNIQUE("reminderId","deviceId")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reminderDelivery" text[] DEFAULT '{"email","push"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_reminder_devices" ADD CONSTRAINT "event_reminder_devices_reminderId_event_reminders_id_fk" FOREIGN KEY ("reminderId") REFERENCES "public"."event_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminder_devices" ADD CONSTRAINT "event_reminder_devices_deviceId_household_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."household_devices"("id") ON DELETE cascade ON UPDATE no action;