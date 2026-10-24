ALTER TABLE "payments" DROP CONSTRAINT "payments_tier_check";--> statement-breakpoint
ALTER TABLE "players" DROP CONSTRAINT "players_membership_check";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tier_check" CHECK (tier is null or tier in ('monthly', 'term', 'kids', 'payg', 'pack'));--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_membership_check" CHECK (membership in ('monthly', 'term', 'kids', 'payg', 'pack'));