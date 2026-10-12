CREATE TABLE "item_research" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "item_research" ADD CONSTRAINT "item_research_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_research_item_url_idx" ON "item_research" USING btree ("item_id","url");