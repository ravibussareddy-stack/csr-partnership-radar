CREATE TABLE "search_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_id" text NOT NULL,
	"query" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"web_queries" text[] DEFAULT '{}' NOT NULL,
	"items_found" integer NOT NULL,
	"items_new" integer NOT NULL,
	"entry_point_html" text,
	"key_label" text,
	"model" text
);
--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "searches" jsonb DEFAULT '[]'::jsonb NOT NULL;