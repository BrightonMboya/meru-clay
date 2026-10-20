CREATE TABLE "session_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"sessions" integer NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_packs_sessions_check" CHECK (sessions > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_purpose_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_tier_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_target_check";--> statement-breakpoint
ALTER TABLE "players" DROP CONSTRAINT "players_membership_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pack_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sessions" integer;--> statement-breakpoint
ALTER TABLE "session_packs" ADD CONSTRAINT "session_packs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_packs" ADD CONSTRAINT "session_packs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_pack_payment" ON "session_packs" USING btree ("payment_id") WHERE payment_id is not null;--> statement-breakpoint
CREATE INDEX "idx_packs_player" ON "session_packs" USING btree ("player_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pack_id_session_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."session_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bookings_pack" ON "bookings" USING btree ("pack_id") WHERE pack_id is not null;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_purpose_check" CHECK (purpose in ('booking', 'membership', 'class', 'trial', 'pack'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tier_check" CHECK (tier is null or tier in ('monthly', 'term', 'payg', 'pack'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_target_check" CHECK ((
        purpose = 'booking' and booking_id is not null
          and player_id is null and lead_id is null and enrolment_id is null
      ) or (
        purpose = 'membership' and tier is not null
          and (player_id is null) <> (lead_id is null)
          and booking_id is null and enrolment_id is null
      ) or (
        purpose = 'class' and enrolment_id is not null
          and booking_id is null and player_id is null and lead_id is null
      ) or (
        purpose = 'trial' and lead_id is not null and session_date is not null
          and booking_id is null and player_id is null and enrolment_id is null
      ) or (
        purpose = 'pack' and sessions is not null
          and (player_id is null) <> (lead_id is null)
          and booking_id is null and enrolment_id is null
      ));--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_membership_check" CHECK (membership in ('monthly', 'term', 'payg', 'pack'));