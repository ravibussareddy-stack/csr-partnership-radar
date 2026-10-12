CREATE TABLE "relationship_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"relationship_id" integer NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"level" text NOT NULL,
	"title" text NOT NULL,
	"impact" text NOT NULL,
	"reasoning" text NOT NULL,
	"source_url" text,
	"item_id" integer,
	"dismissed" boolean DEFAULT false NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_checks" (
	"relationship_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"relevant" boolean NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"company_id" integer,
	"programme" text,
	"sectors" text[] DEFAULT '{}' NOT NULL,
	"districts" text[] DEFAULT '{}' NOT NULL,
	"value_lakh" real,
	"start_date" text,
	"renewal_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_role" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "relationship_alerts" ADD CONSTRAINT "relationship_alerts_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_alerts" ADD CONSTRAINT "relationship_alerts_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_checks" ADD CONSTRAINT "relationship_checks_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_checks" ADD CONSTRAINT "relationship_checks_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_alert_key_idx" ON "relationship_alerts" USING btree ("relationship_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_check_idx" ON "relationship_checks" USING btree ("relationship_id","item_id");