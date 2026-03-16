ALTER TABLE "key_results" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "objectives" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "key_results" CASCADE;--> statement-breakpoint
DROP TABLE "objectives" CASCADE;--> statement-breakpoint
ALTER TABLE "entity_links" ALTER COLUMN "source_id" SET DATA TYPE text USING source_id::text;