CREATE TABLE "household_device_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deviceId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	CONSTRAINT "household_device_members_device_user_unique" UNIQUE("deviceId","userId")
);
--> statement-breakpoint
CREATE TABLE "household_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"room" text,
	"apikeyId" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"offlineAfterMinutes" integer NOT NULL,
	"alertsEnabled" boolean DEFAULT true NOT NULL,
	"lastSeenAt" timestamp with time zone,
	"lastStatus" jsonb,
	"offlineAlertedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_devices_apikey_unique" UNIQUE("apikeyId")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receivesDeviceAlerts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "household_device_members" ADD CONSTRAINT "household_device_members_deviceId_household_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."household_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_device_members" ADD CONSTRAINT "household_device_members_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_devices" ADD CONSTRAINT "household_devices_apikeyId_apikeys_id_fk" FOREIGN KEY ("apikeyId") REFERENCES "public"."apikeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_device_members_user_id_idx" ON "household_device_members" USING btree ("userId");--> statement-breakpoint
-- Phase 23: admins get device alerts by default; other members opt in.
UPDATE "users" SET "receivesDeviceAlerts" = true WHERE "role" = 'admin' AND "isService" = false;