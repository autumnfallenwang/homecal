CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startDate" text NOT NULL,
	"endDate" text NOT NULL,
	"startTime" text NOT NULL,
	"endTime" text NOT NULL,
	"repeatEvery" integer DEFAULT 1 NOT NULL,
	"repeatUnit" text DEFAULT 'weeks' NOT NULL,
	"weekDays" text,
	"monthDay" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_seriesId_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;