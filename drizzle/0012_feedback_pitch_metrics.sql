CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer,
	"company_id" integer,
	"action" text NOT NULL,
	"reason" text,
	"source" text,
	"signal_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_metrics" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_kits" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "link_status" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_kits" ADD CONSTRAINT "pitch_kits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_item_action_idx" ON "feedback" USING btree ("item_id","action");