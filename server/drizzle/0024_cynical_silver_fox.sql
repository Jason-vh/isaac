CREATE TABLE "sprints" (
	"id" integer PRIMARY KEY NOT NULL,
	"board_id" integer NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"goal" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"complete_date" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sprints_start_date_idx" ON "sprints" USING btree ("start_date");