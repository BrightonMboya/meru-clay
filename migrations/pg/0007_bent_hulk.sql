CREATE TABLE "lead_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"wa_message_id" text,
	"template" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_messages_direction_check" CHECK (direction in ('in', 'out')),
	CONSTRAINT "lead_messages_status_check" CHECK (status in ('queued', 'sent', 'delivered', 'read', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'other' NOT NULL,
	"campaign" text,
	"note" text,
	"owner" text,
	"player_id" integer,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_stage_check" CHECK (stage in ('new', 'contacted', 'trial_booked', 'came_to_trial', 'joined', 'lost')),
	CONSTRAINT "leads_source_check" CHECK (source in ('instagram', 'facebook', 'whatsapp', 'walk_in', 'referral', 'other'))
);
--> statement-breakpoint
ALTER TABLE "lead_messages" ADD CONSTRAINT "lead_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_lead_message_wamid" ON "lead_messages" USING btree ("wa_message_id") WHERE wa_message_id is not null;--> statement-breakpoint
CREATE INDEX "idx_lead_messages_lead" ON "lead_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_lead_phone" ON "leads" USING btree ("phone") WHERE stage <> 'lost';--> statement-breakpoint
CREATE INDEX "idx_leads_stage" ON "leads" USING btree ("stage","created_at");