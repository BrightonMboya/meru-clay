CREATE TABLE "admin_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"invited_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_admin_invite_email" ON "admin_invites" USING btree ("email");