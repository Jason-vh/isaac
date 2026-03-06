CREATE TABLE "commits" (
	"id" serial PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"sha" text NOT NULL,
	"title" text NOT NULL,
	"authored_at" timestamp with time zone NOT NULL,
	CONSTRAINT "commits_sha_unique" UNIQUE("sha")
);
--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;