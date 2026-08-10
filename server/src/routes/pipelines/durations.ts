import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { queryRows } from "../../db";
import { parseLimit } from "../../lib/request";
import {
  DAYS,
  MERGE_OR_TRAIN,
  isoRange,
  mapPipelineRow,
  toIso,
  type PipelineRow,
} from "./shared";

const MAX_LIST_LIMIT = 200;

interface ScatterRow {
  id: number;
  ref: string;
  duration_seconds: number | null;
  queued_duration_seconds: string | number | null;
  gitlab_created_at: Date;
  web_url: string;
  job_count: number;
  retried_job_count: number;
  job_duration_sum: string | number | null;
  has_backend: boolean;
  has_frontend: boolean;
}

interface JobDetailRow {
  id: number;
  name: string;
  stage: string;
  status: string;
  duration_seconds: string | number | null;
  queued_duration_seconds: string | number | null;
  allow_failure: boolean;
  retried: boolean;
  needs: string[] | null;
  web_url: string;
  started_at: Date | null;
  finished_at: Date | null;
}

function scopeOf(hasBackend: boolean, hasFrontend: boolean): string {
  if (hasBackend && hasFrontend) return "fullstack";
  if (hasBackend) return "backend";
  if (hasFrontend) return "frontend";
  return "neither";
}

export const durationRoutes = new Elysia()
  // Individual successful merge/train pipelines
  .get("/duration-scatter", async ({ query }) => {
    const { since, until } = isoRange(query, DAYS.month);

    const rows = await queryRows<ScatterRow>(sql`
      SELECT
        p.id, p.ref, p.duration_seconds, p.queued_duration_seconds, p.gitlab_created_at, p.web_url,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count,
        (
          SELECT round(sum(j.duration_seconds::numeric), 0)
          FROM pipeline_jobs j
          WHERE j.pipeline_id = p.id
            AND j.retried = false
            AND j.duration_seconds IS NOT NULL
        ) AS job_duration_sum,
        EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.name LIKE 'backend_tests%' AND j.retried = false) AS has_backend,
        EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND (j.name = 'frontend_tests' OR j.name = 'cypress_component_tests') AND j.retried = false) AS has_frontend
      FROM pipelines p
      WHERE p.status = 'success'
        AND p.duration_seconds IS NOT NULL
        AND ${MERGE_OR_TRAIN}
        AND p.gitlab_created_at >= ${since}
        AND p.gitlab_created_at <= ${until}
      ORDER BY p.gitlab_created_at
    `);

    return rows.map((r) => ({
      id: Number(r.id),
      type: r.ref.endsWith("/train") ? "train" : "merge",
      scope: scopeOf(r.has_backend, r.has_frontend),
      durationSeconds: r.duration_seconds,
      queuedDurationSeconds:
        r.queued_duration_seconds != null ? Number(r.queued_duration_seconds) : null,
      createdAt: new Date(r.gitlab_created_at).toISOString(),
      webUrl: r.web_url,
      jobCount: r.job_count,
      retriedJobCount: r.retried_job_count,
      jobDurationSum: r.job_duration_sum != null ? Number(r.job_duration_sum) : null,
    }));
  })

  // Recent pipelines
  .get("/list", async ({ query }) => {
    const limit = parseLimit(query?.limit, 50, MAX_LIST_LIMIT);
    const source = query?.source || null;
    const sourceFilter = source ? sql`AND p.source = ${source}` : sql``;

    const rows = await queryRows<PipelineRow>(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE 1=1 ${sourceFilter}
      ORDER BY p.gitlab_created_at DESC
      LIMIT ${limit}
    `);

    return rows.map(mapPipelineRow);
  })

  // A single pipeline with its jobs
  .get("/:id/jobs", async ({ params, set }) => {
    const pipelineId = Number(params.id);
    if (!Number.isInteger(pipelineId)) {
      set.status = 400;
      return { error: "Invalid pipeline id" };
    }

    const [pipeline] = await queryRows<PipelineRow>(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE p.id = ${pipelineId}
    `);

    if (!pipeline) {
      set.status = 404;
      return { error: "Pipeline not found" };
    }

    const jobRows = await queryRows<JobDetailRow>(sql`
      SELECT
        j.id, j.name, j.stage, j.status, j.duration_seconds,
        j.queued_duration_seconds, j.allow_failure, j.retried,
        j.needs, j.web_url, j.started_at, j.finished_at
      FROM pipeline_jobs j
      WHERE j.pipeline_id = ${pipelineId}
      ORDER BY j.started_at NULLS LAST, j.id
    `);

    return {
      ...mapPipelineRow(pipeline),
      jobs: jobRows.map((j) => ({
        id: Number(j.id),
        name: j.name,
        stage: j.stage,
        status: j.status,
        durationSeconds: j.duration_seconds != null ? Number(j.duration_seconds) : null,
        queuedDurationSeconds:
          j.queued_duration_seconds != null ? Number(j.queued_duration_seconds) : null,
        allowFailure: j.allow_failure,
        retried: j.retried,
        needs: j.needs ?? null,
        webUrl: j.web_url,
        startedAt: toIso(j.started_at),
        finishedAt: toIso(j.finished_at),
      })),
    };
  });
