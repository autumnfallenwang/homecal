CREATE TABLE "digest_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sendAt" text DEFAULT '07:00' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"lastSentOn" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_settings_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receivesDailyDigest" boolean DEFAULT true NOT NULL;