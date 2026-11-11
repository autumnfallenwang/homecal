CREATE TABLE "device_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deviceId" uuid NOT NULL,
	"text" text NOT NULL,
	"sound" text DEFAULT 'chime' NOT NULL,
	"source" text NOT NULL,
	"createdById" uuid,
	"expiresAt" timestamp with time zone NOT NULL,
	"playedAt" timestamp with time zone,
	"playOk" boolean,
	"playError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_announcements" ADD CONSTRAINT "device_announcements_deviceId_household_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."household_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_announcements" ADD CONSTRAINT "device_announcements_createdById_users_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_announcements_device_id_idx" ON "device_announcements" USING btree ("deviceId");