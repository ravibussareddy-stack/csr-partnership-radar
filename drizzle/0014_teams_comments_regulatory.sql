CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer,
	"kind" text NOT NULL,
	"item_id" integer,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"member_id" integer,
	"parent_id" integer,
	"kind" text DEFAULT 'comment' NOT NULL,
	"body" text NOT NULL,
	"mentions" integer[] DEFAULT '{}' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer,
	"page" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"route" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_time" (
	"member_id" integer NOT NULL,
	"day" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"pages" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"passcode_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "team_members_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "headline" text;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "worth_it" text;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "policy_status" text;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "quotes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_feedback" ADD CONSTRAINT "dashboard_feedback_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_time" ADD CONSTRAINT "member_time_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_time_idx" ON "member_time" USING btree ("member_id","day");