CREATE TABLE "wbso_entry_marks" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"row_key" text NOT NULL,
	"hours" numeric NOT NULL,
	"marked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wbso_entry_marks_date_row_idx" ON "wbso_entry_marks" USING btree ("date","row_key");