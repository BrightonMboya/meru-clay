ALTER TABLE "payments" DROP CONSTRAINT "payments_purpose_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_target_check";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "session_date" date;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_purpose_check" CHECK (purpose in ('booking', 'membership', 'class', 'trial'));--> statement-breakpoint
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
      ));