CREATE TABLE "blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"court_id" integer,
	"date" date NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"court_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"notes" text,
	"coach" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"paid" boolean DEFAULT false NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_check" CHECK (status in ('held', 'confirmed', 'cancelled')),
	CONSTRAINT "bookings_span_check" CHECK (end_min > start_min)
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"floodlit" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blocks_date" ON "blocks" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_live_slot" ON "bookings" USING btree ("court_id","date","start_min") WHERE status in ('held', 'confirmed');--> statement-breakpoint
CREATE INDEX "idx_bookings_date" ON "bookings" USING btree ("date","status");--> statement-breakpoint
CREATE INDEX "idx_bookings_coach" ON "bookings" USING btree ("date","coach") WHERE coach and status in ('held', 'confirmed');