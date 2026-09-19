CREATE TABLE "class_enrolments" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"court_id" integer NOT NULL,
	"start_min" integer NOT NULL,
	"class_name" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolments_status_check" CHECK (status in ('booked', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "class_enrolments" ADD CONSTRAINT "class_enrolments_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_class_place" ON "class_enrolments" USING btree ("date","court_id","start_min","phone") WHERE status = 'booked' and phone <> '';--> statement-breakpoint
CREATE INDEX "idx_enrolments_date" ON "class_enrolments" USING btree ("date","status");