CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text,
	"role" text DEFAULT 'member' NOT NULL,
	"level" text,
	"previous_level" text,
	"level_set_at" date,
	"birth_year" integer,
	"guardian_name" text,
	"guardian_phone" text,
	"membership" text DEFAULT 'monthly' NOT NULL,
	"paid_until" date,
	"availability" text DEFAULT 'open' NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"joined_on" date DEFAULT current_date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_role_check" CHECK (role in ('member', 'coach')),
	CONSTRAINT "players_level_check" CHECK (level is null or level in ('Red ball', 'Green ball', 'Social', 'Club', 'Competitive', 'Open')),
	CONSTRAINT "players_previous_level_check" CHECK (previous_level is null or previous_level in ('Red ball', 'Green ball', 'Social', 'Club', 'Competitive', 'Open')),
	CONSTRAINT "players_membership_check" CHECK (membership in ('monthly', 'term', 'payg')),
	CONSTRAINT "players_availability_check" CHECK (availability in ('open', 'weekends', 'evenings', 'away', 'none')),
	CONSTRAINT "players_record_check" CHECK (wins >= 0 and losses >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_player_phone" ON "players" USING btree ("phone") WHERE active and phone <> '';--> statement-breakpoint
CREATE INDEX "idx_players_active" ON "players" USING btree ("active","role");