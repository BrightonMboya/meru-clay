CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" text,
	"source" text NOT NULL,
	"event" text NOT NULL,
	"flw_tx_id" bigint,
	"status" text,
	"amount" integer,
	"raw" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_source_check" CHECK (source in ('checkout', 'webhook', 'verify', 'cron'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'flutterwave' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"booking_id" text,
	"player_id" integer,
	"lead_id" integer,
	"enrolment_id" integer,
	"tier" text,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"tx_ref" text,
	"checkout_url" text,
	"flw_tx_id" bigint,
	"flw_ref" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_purpose_check" CHECK (purpose in ('booking', 'membership', 'class')),
	CONSTRAINT "payments_status_check" CHECK (status in ('pending', 'processing', 'successful', 'failed', 'abandoned', 'refunded')),
	CONSTRAINT "payments_method_check" CHECK (method in ('flutterwave', 'cash')),
	CONSTRAINT "payments_tier_check" CHECK (tier is null or tier in ('monthly', 'term', 'payg')),
	CONSTRAINT "payments_amount_check" CHECK (amount >= 0),
	CONSTRAINT "payments_target_check" CHECK ((
        purpose = 'booking' and booking_id is not null
          and player_id is null and lead_id is null and enrolment_id is null
      ) or (
        purpose = 'membership' and tier is not null
          and (player_id is null) <> (lead_id is null)
          and booking_id is null and enrolment_id is null
      ) or (
        purpose = 'class' and enrolment_id is not null
          and booking_id is null and player_id is null and lead_id is null
      ))
);
--> statement-breakpoint
ALTER TABLE "class_enrolments" ADD COLUMN "amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrolments" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrolment_id_class_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."class_enrolments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_event" ON "payment_events" USING btree ("flw_tx_id","event","source") WHERE flw_tx_id is not null;--> statement-breakpoint
CREATE INDEX "idx_payment_events_payment" ON "payment_events" USING btree ("payment_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_tx_ref" ON "payments" USING btree ("tx_ref") WHERE tx_ref is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payment_flw_tx" ON "payments" USING btree ("flw_tx_id") WHERE flw_tx_id is not null;--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_payments_booking" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payments_player" ON "payments" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_payments_unfulfilled" ON "payments" USING btree ("paid_at") WHERE paid_at is not null and fulfilled_at is null;