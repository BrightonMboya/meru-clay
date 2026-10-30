CREATE TABLE "trials" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"booking_id" text,
	"date" date NOT NULL,
	"start_min" integer NOT NULL,
	"player" text NOT NULL,
	"child_name" text,
	"child_age" integer,
	"level" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trials_player_check" CHECK (player in ('child', 'adult')),
	CONSTRAINT "trials_level_check" CHECK (level in ('never', 'some', 'regular')),
	CONSTRAINT "trials_child_check" CHECK (player <> 'child' or (child_name is not null and child_age is not null))
);
--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trials_lead" ON "trials" USING btree ("lead_id","date");