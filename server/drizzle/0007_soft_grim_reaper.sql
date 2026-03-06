ALTER TABLE "pipelines" ADD COLUMN "merge_request_id" integer;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE pipelines p
SET merge_request_id = mr.id
FROM merge_requests mr
WHERE p.ref ~ '^refs/merge-requests/\d+/'
  AND mr.gitlab_iid = (regexp_match(p.ref, '^refs/merge-requests/(\d+)/'))[1]::int;
