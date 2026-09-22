ALTER TABLE "payments" DROP CONSTRAINT "payments_method_check";--> statement-breakpoint
DROP INDEX "uniq_payment_flw_tx";--> statement-breakpoint
DROP INDEX "uniq_payment_event";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'online';--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "provider_tx_id" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_tx_id" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_provider_tx" ON "payments" USING btree ("provider_tx_id") WHERE provider_tx_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_event" ON "payment_events" USING btree ("provider_tx_id","event","source") WHERE provider_tx_id is not null;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_check" CHECK (method in ('online', 'cash'));