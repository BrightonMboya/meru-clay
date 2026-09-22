DROP INDEX "uniq_payment_event";--> statement-breakpoint
DROP INDEX "uniq_payment_provider_tx";--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "provider_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_event_id" ON "payment_events" USING btree ("event_id") WHERE event_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_provider_ref" ON "payments" USING btree ("provider_ref") WHERE provider_ref is not null;