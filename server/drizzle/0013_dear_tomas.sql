CREATE TABLE "merge_request_comments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"body" text NOT NULL,
	"external_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merge_request_comments" ADD CONSTRAINT "merge_request_comments_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;