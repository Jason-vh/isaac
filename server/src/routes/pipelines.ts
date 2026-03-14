import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { pipelines, pipelineJobs } from "../db/schema";

export const pipelineRoutes = new Elysia({ prefix: "/api/pipelines" })
  // Duration scatter: individual successful merge/train pipelines
  .get("/duration-scatter", async ({ query }) => {
    const since = query?.since
      || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const until = query?.until || new Date().toISOString();

    const rows = await db.execute(sql`
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
        ) AS job_duration_sum
      FROM pipelines p
      WHERE p.status = 'success'
        AND p.duration_seconds IS NOT NULL
        AND p.ref LIKE 'refs/merge-requests/%'
        AND (p.ref LIKE '%/merge' OR p.ref LIKE '%/train')
        AND p.gitlab_created_at >= ${since}
        AND p.gitlab_created_at <= ${until}
      ORDER BY p.gitlab_created_at
    `);

    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      type: (r.ref as string).endsWith("/train") ? "train" : "merge",
      durationSeconds: r.duration_seconds,
      queuedDurationSeconds: r.queued_duration_seconds ? Number(r.queued_duration_seconds) : null,
      createdAt: new Date(r.gitlab_created_at).toISOString(),
      webUrl: r.web_url,
      jobCount: r.job_count,
      retriedJobCount: r.retried_job_count,
      jobDurationSum: r.job_duration_sum !== null ? Number(r.job_duration_sum) : null,
    }));
  })

  // Job stats: average duration per job name for successful merge/train pipelines
  .get("/job-stats", async ({ query }) => {
    const since = query?.since
      || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = query?.until || new Date().toISOString();

    const rows = await db.execute(sql`
      WITH pipeline_ids AS (
        SELECT id FROM pipelines
        WHERE status = 'success'
          AND ref LIKE 'refs/merge-requests/%'
          AND (ref LIKE '%/merge' OR ref LIKE '%/train')
          AND gitlab_created_at >= ${since}
          AND gitlab_created_at <= ${until}
      ),
      duration_stats AS (
        SELECT
          j.name,
          j.stage,
          count(*)::int AS run_count,
          round(avg(j.duration_seconds::numeric), 1) AS avg_duration,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY j.duration_seconds::numeric) AS p50_duration,
          round(avg(CASE WHEN j.queued_duration_seconds IS NOT NULL THEN j.queued_duration_seconds::numeric END), 1) AS avg_queued_duration,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY j.queued_duration_seconds::numeric) FILTER (WHERE j.queued_duration_seconds IS NOT NULL) AS p50_queued_duration
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = false
          AND j.duration_seconds IS NOT NULL
          AND j.stage != 'security'
          AND j.name != 'pages'
        GROUP BY j.name, j.stage
      ),
      retry_counts AS (
        SELECT j.name, count(*)::int AS retry_count
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = true
          AND j.stage != 'security'
          AND j.name != 'pages'
        GROUP BY j.name
      ),
      job_needs AS (
        SELECT DISTINCT ON (j.name)
          j.name,
          j.needs
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = false
          AND j.stage != 'security'
          AND j.name != 'pages'
        ORDER BY j.name, j.pipeline_id DESC
      )
      SELECT
        d.name, d.stage, d.run_count, d.avg_duration, d.p50_duration, d.avg_queued_duration, d.p50_queued_duration,
        COALESCE(r.retry_count, 0) AS retry_count,
        COALESCE(n.needs, '{}') AS needs
      FROM duration_stats d
      LEFT JOIN retry_counts r ON r.name = d.name
      LEFT JOIN job_needs n ON n.name = d.name
      ORDER BY d.p50_duration DESC
    `);

    return (rows as any[]).map((r) => ({
      name: r.name,
      stage: r.stage,
      runCount: r.run_count,
      avgDuration: Number(r.avg_duration),
      p50Duration: r.p50_duration ? Math.round(Number(r.p50_duration)) : null,
      avgQueuedDuration: r.avg_queued_duration ? Number(r.avg_queued_duration) : null,
      p50QueuedDuration: r.p50_queued_duration ? Math.round(Number(r.p50_queued_duration)) : null,
      retryCount: r.retry_count,
      needs: r.needs ?? [],
    }));
  })

  // Recent pipelines list
  .get("/list", async ({ query }) => {
    const limit = Math.min(Number(query?.limit) || 50, 200);
    const source = query?.source || null;

    const sourceFilter = source ? sql`AND p.source = ${source}` : sql``;

    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.ref,
        p.status,
        p.source,
        p.duration_seconds,
        p.web_url,
        p.gitlab_created_at,
        p.started_at,
        p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE 1=1 ${sourceFilter}
      ORDER BY p.gitlab_created_at DESC
      LIMIT ${limit}
    `);

    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      ref: r.ref,
      status: r.status,
      source: r.source,
      durationSeconds: r.duration_seconds,
      jobCount: r.job_count,
      retriedJobCount: r.retried_job_count,
      webUrl: r.web_url,
      gitlabCreatedAt: new Date(r.gitlab_created_at).toISOString(),
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    }));
  })

  // Pipeline detail with jobs
  .get("/:id/jobs", async ({ params }) => {
    const pipelineId = Number(params.id);

    const pRows = await db.execute(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE p.id = ${pipelineId}
    `);

    if ((pRows as any[]).length === 0) {
      return { error: "Pipeline not found" };
    }

    const p = (pRows as any[])[0];

    const jobRows = await db.execute(sql`
      SELECT
        j.id, j.name, j.stage, j.status, j.duration_seconds,
        j.queued_duration_seconds, j.allow_failure, j.retried,
        j.needs, j.web_url, j.started_at, j.finished_at
      FROM pipeline_jobs j
      WHERE j.pipeline_id = ${pipelineId}
      ORDER BY j.started_at NULLS LAST, j.id
    `);

    return {
      id: Number(p.id),
      ref: p.ref,
      status: p.status,
      source: p.source,
      durationSeconds: p.duration_seconds,
      jobCount: p.job_count,
      retriedJobCount: p.retried_job_count,
      webUrl: p.web_url,
      gitlabCreatedAt: new Date(p.gitlab_created_at).toISOString(),
      startedAt: p.started_at ? new Date(p.started_at).toISOString() : null,
      finishedAt: p.finished_at ? new Date(p.finished_at).toISOString() : null,
      jobs: (jobRows as any[]).map((j) => ({
        id: Number(j.id),
        name: j.name,
        stage: j.stage,
        status: j.status,
        durationSeconds: j.duration_seconds ? Number(j.duration_seconds) : null,
        queuedDurationSeconds: j.queued_duration_seconds ? Number(j.queued_duration_seconds) : null,
        allowFailure: j.allow_failure,
        retried: j.retried,
        needs: j.needs ?? null,
        webUrl: j.web_url,
        startedAt: j.started_at ? new Date(j.started_at).toISOString() : null,
        finishedAt: j.finished_at ? new Date(j.finished_at).toISOString() : null,
      })),
    };
  })

  // Merge requests with pipeline counts
  .get("/merge-requests", async ({ query }) => {
    const limit = Math.min(Number(query?.limit) || 30, 100);

    const rows = await db.execute(sql`
      SELECT
        mr.id,
        mr.gitlab_iid,
        mr.project_path,
        mr.title,
        mr.status,
        mr.branch_name,
        mr.gitlab_created_at,
        mr.merged_at,
        (SELECT count(*)::int FROM pipelines p WHERE p.merge_request_id = mr.id) AS pipeline_count
      FROM merge_requests mr
      WHERE EXISTS (SELECT 1 FROM pipelines p WHERE p.merge_request_id = mr.id)
      ORDER BY mr.gitlab_created_at DESC
      LIMIT ${limit}
    `);

    return (rows as any[]).map((r) => ({
      id: r.id,
      gitlabIid: r.gitlab_iid,
      projectPath: r.project_path,
      title: r.title,
      status: r.status,
      branchName: r.branch_name,
      pipelineCount: r.pipeline_count,
      gitlabCreatedAt: new Date(r.gitlab_created_at).toISOString(),
      mergedAt: r.merged_at ? new Date(r.merged_at).toISOString() : null,
    }));
  })

  // Pipelines for a specific MR
  .get("/merge-requests/:id/pipelines", async ({ params }) => {
    const mrId = Number(params.id);

    const rows = await db.execute(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE p.merge_request_id = ${mrId}
      ORDER BY p.gitlab_created_at DESC
    `);

    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      ref: r.ref,
      status: r.status,
      source: r.source,
      durationSeconds: r.duration_seconds,
      jobCount: r.job_count,
      retriedJobCount: r.retried_job_count,
      webUrl: r.web_url,
      gitlabCreatedAt: new Date(r.gitlab_created_at).toISOString(),
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    }));
  });
