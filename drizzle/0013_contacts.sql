CREATE TABLE "contact_scans" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"found" integer NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"title" text,
	"company_name" text,
	"company_key" text DEFAULT '' NOT NULL,
	"company_id" integer,
	"kind" text DEFAULT 'spokesperson' NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"context" text,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contact_scans" ADD CONSTRAINT "contact_scans_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_person_idx" ON "contacts" USING btree ("name_key","company_key");