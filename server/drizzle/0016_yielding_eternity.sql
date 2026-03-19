CREATE TABLE "activity_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"merge_request_id" integer,
	"pipeline_id" bigint,
	"ticket_key" text,
	"actor" text,
	"title" text NOT NULL,
	"body" text,
	"external_url" text NOT NULL,
	"notified_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_items_source_id_unique" UNIQUE("source_id")
);
--> statement-breakpoint
ALTER TABLE "activity_items" ADD CONSTRAINT "activity_items_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_items" ADD CONSTRAINT "activity_items_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_items_occurred_at_idx" ON "activity_items" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "activity_items_source_type_idx" ON "activity_items" USING btree ("source_type");