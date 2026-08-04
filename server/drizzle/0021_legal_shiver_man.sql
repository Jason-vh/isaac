CREATE TABLE "merge_request_state_events" (
	"id" bigint PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"person_id" integer,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "threads_opened" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "threads_resolved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "first_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "last_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merge_request_state_events" ADD CONSTRAINT "merge_request_state_events_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_state_events" ADD CONSTRAINT "merge_request_state_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merge_request_state_events_mr_type_idx" ON "merge_request_state_events" USING btree ("merge_request_id","event_type");