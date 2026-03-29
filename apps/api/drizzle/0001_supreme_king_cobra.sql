CREATE TABLE "event_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	CONSTRAINT "event_assignees_event_user_unique" UNIQUE("eventId","userId")
);
--> statement-breakpoint
ALTER TABLE "event_assignees" ADD CONSTRAINT "event_assignees_eventId_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assignees" ADD CONSTRAINT "event_assignees_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_assignees_event_id_idx" ON "event_assignees" USING btree ("eventId");--> statement-breakpoint
CREATE INDEX "event_assignees_user_id_idx" ON "event_assignees" USING btree ("userId");--> statement-breakpoint
INSERT INTO "event_assignees" ("id", "eventId", "userId") SELECT gen_random_uuid(), "id", "ownerId" FROM "events";