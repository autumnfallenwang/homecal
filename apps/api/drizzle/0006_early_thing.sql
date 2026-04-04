ALTER TABLE "events" ADD COLUMN "seriesId" uuid;--> statement-breakpoint
CREATE INDEX "events_series_id_idx" ON "events" USING btree ("seriesId");