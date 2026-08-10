import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { queryRows } from "../../db";
import { parseLimit, parseOptionalDate } from "../../lib/request";
import { mapPipelineRow, toIso, type PipelineRow } from "./shared";

const MAX_LIMIT = 200;
const DEFAULT_SINCE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface MrPipelineSummaryRow {
  id: number;
  gitlab_iid: number;
  project_path: string;
  title: string;
  status: string;
  branch_name: string;
  gitlab_created_at: Date;
  merged_at: Date | null;
  pipeline_count: number;
  failed_count: number;
  success_count: number;
  total_duration_seconds: string | number | null;
  first_pipeline_at: Date | null;
  last_pipeline_at: Date | null;
}

export const mergeRequestPipelineRoutes = new Elysia()
  // Merge requests with pipeline counts and a CI cost summary
  .get("/merge-requests", async ({ query }) => {
    const limit = parseLimit(query?.limit, 50, MAX_LIMIT);
    const search = query?.search?.trim() || null;
    const since =
      parseOptionalDate(query?.since, "since") ??
      new Date(Date.now() - DEFAULT_SINCE_DAYS * DAY_MS);

    // A search should reach older MRs, so it drops the date filter.
    const sinceFilter = search
      ? sql``
      : sql`AND p.gitlab_created_at >= ${since.toISOString()}`;
    const searchFilter = search
      ? sql`AND mr.title ILIKE ${`%${search}%`}`
      : sql``;

    const rows = await queryRows<MrPipelineSummaryRow>(sql`
      SELECT
        mr.id, mr.gitlab_iid, mr.project_path, mr.title, mr.status,
        mr.branch_name, mr.gitlab_created_at, mr.merged_at,
        COUNT(p.id)::int AS pipeline_count,
        COUNT(p.id) FILTER (WHERE p.status = 'failed')::int AS failed_count,
        COUNT(p.id) FILTER (WHERE p.status = 'success')::int AS success_count,
        SUM(p.duration_seconds) AS total_duration_seconds,
        MIN(p.gitlab_created_at) AS first_pipeline_at,
        MAX(p.gitlab_created_at) AS last_pipeline_at
      FROM merge_requests mr
      JOIN pipelines p ON p.merge_request_id = mr.id
      WHERE 1=1 ${sinceFilter} ${searchFilter}
      GROUP BY mr.id
      ORDER BY mr.gitlab_created_at DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      id: r.id,
      gitlabIid: r.gitlab_iid,
      projectPath: r.project_path,
      title: r.title,
      status: r.status,
      branchName: r.branch_name,
      pipelineCount: r.pipeline_count,
      failedCount: r.failed_count,
      successCount: r.success_count,
      totalDurationSeconds: r.total_duration_seconds,
      firstPipelineAt: toIso(r.first_pipeline_at),
      lastPipelineAt: toIso(r.last_pipeline_at),
      gitlabCreatedAt: new Date(r.gitlab_created_at).toISOString(),
      mergedAt: toIso(r.merged_at),
    }));
  })

  // Every pipeline for one merge request
  .get("/merge-requests/:id/pipelines", async ({ params, set }) => {
    const mrId = Number(params.id);
    if (!Number.isInteger(mrId)) {
      set.status = 400;
      return { error: "Invalid merge request id" };
    }

    const rows = await queryRows<PipelineRow>(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE p.merge_request_id = ${mrId}
      ORDER BY p.gitlab_created_at DESC
    `);

    return rows.map(mapPipelineRow);
  });
