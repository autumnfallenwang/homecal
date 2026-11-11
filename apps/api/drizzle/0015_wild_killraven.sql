CREATE TABLE "routine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routineId" uuid NOT NULL,
	"deviceId" uuid NOT NULL,
	"occurrenceDate" text NOT NULL,
	"scheduledAt" timestamp with time zone NOT NULL,
	"rangAt" timestamp with time zone,
	"ok" boolean,
	"error" text,
	"offlineWarnedAt" timestamp with time zone,
	"missedAlertedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_runs_routine_device_date_unique" UNIQUE("routineId","deviceId","occurrenceDate")
);
--> statement-breakpoint
CREATE TABLE "routine_skips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routineId" uuid NOT NULL,
	"date" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_skips_routine_date_unique" UNIQUE("routineId","date")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memberId" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"time" text NOT NULL,
	"weekDays" text NOT NULL,
	"sound" text DEFAULT 'beeps' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"skipHolidays" boolean DEFAULT true NOT NULL,
	"includeBriefing" boolean DEFAULT true NOT NULL,
	"pausedUntil" text,
	"createdById" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routineId_routines_id_fk" FOREIGN KEY ("routineId") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_deviceId_household_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."household_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_skips" ADD CONSTRAINT "routine_skips_routineId_routines_id_fk" FOREIGN KEY ("routineId") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_memberId_users_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_createdById_users_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routines_member_id_idx" ON "routines" USING btree ("memberId");