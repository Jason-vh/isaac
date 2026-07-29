CREATE TABLE "merge_request_file_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"path" text NOT NULL,
	"category" text NOT NULL,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merge_request_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"first_reviewed_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"gitlab_username" text,
	"jira_account_id" text,
	"is_me" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "people_email_unique" UNIQUE("email"),
	CONSTRAINT "people_gitlab_username_unique" UNIQUE("gitlab_username"),
	CONSTRAINT "people_jira_account_id_unique" UNIQUE("jira_account_id")
);
--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "author_person_id" integer;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "additions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "deletions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignee_person_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reporter_person_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closing_assignee_person_id" integer;--> statement-breakpoint
ALTER TABLE "merge_request_file_stats" ADD CONSTRAINT "merge_request_file_stats_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_reviews" ADD CONSTRAINT "merge_request_reviews_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_reviews" ADD CONSTRAINT "merge_request_reviews_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merge_request_file_stats_mr_path_idx" ON "merge_request_file_stats" USING btree ("merge_request_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "merge_request_reviews_mr_person_idx" ON "merge_request_reviews" USING btree ("merge_request_id","person_id");--> statement-breakpoint
CREATE INDEX "merge_request_reviews_person_idx" ON "merge_request_reviews" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_person_id_people_id_fk" FOREIGN KEY ("assignee_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_closing_assignee_person_id_people_id_fk" FOREIGN KEY ("closing_assignee_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merge_requests_merged_at_idx" ON "merge_requests" USING btree ("merged_at");