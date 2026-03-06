import { Elysia } from "elysia";
import { sql, gte, and, eq } from "drizzle-orm";
import { db } from "../db";
import { pipelines, pipelineJobs } from "../db/schema";

function weeksAgoISO(weeks: number): string {
  return new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

export const pipelineRoutes = new Elysia({ prefix: "/api/pipelines" })
  // Weekly aggregated metrics
  .get("/metrics", async ({ query }) => {
    const weeks = Number(query?.weeks) || 8;
    const since = weeksAgoISO(weeks);

    const rows = await db.execute(sql`
      WITH weekly AS (
        SELECT
          date_trunc('week', gitlab_created_at) AS week_start,
          duration_seconds,
          queued_duration_seconds,
          status
        FROM pipelines
        WHERE gitlab_created_at >= ${since}
      )
      SELECT
        week_start,
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'success')::int AS success_count,
        count(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds)
          FILTER (WHERE duration_seconds IS NOT NULL) AS p50_duration,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_seconds)
          FILTER (WHERE duration_seconds IS NOT NULL) AS p90_duration,
        max(duration_seconds) AS max_duration,
        avg(queued_duration_seconds)
          FILTER (WHERE queued_duration_seconds IS NOT NULL) AS avg_queue_time
      FROM weekly
      GROUP BY week_start
      ORDER BY week_start
    `);

    // Compute retry rate per week separately (from jobs table)
    const retryRows = await db.execute(sql`
      SELECT
        date_trunc('week', p.gitlab_created_at) AS week_start,
        count(*) FILTER (WHERE j.retried = true)::int AS retried_count,
        count(*)::int AS total_jobs
      FROM pipeline_jobs j
      JOIN pipelines p ON p.id = j.pipeline_id
      WHERE p.gitlab_created_at >= ${since}
      GROUP BY week_start
      ORDER BY week_start
    `);

    const retryMap = new Map<string, { retried: number; total: number }>();
    for (const r of retryRows) {
      const key = new Date(r.week_start as string).toISOString();
      retryMap.set(key, {
        retried: r.retried_count as number,
        total: r.total_jobs as number,
      });
    }

    return (rows as any[]).map((r) => {
      const weekKey = new Date(r.week_start).toISOString();
      const retry = retryMap.get(weekKey);
      return {
        weekStart: weekKey,
        total: r.total,
        successCount: r.success_count,
        failedCount: r.failed_count,
        p50Duration: r.p50_duration ? Math.round(Number(r.p50_duration)) : null,
        p90Duration: r.p90_duration ? Math.round(Number(r.p90_duration)) : null,
        maxDuration: r.max_duration,
        avgQueueTime: r.avg_queue_time
          ? Math.round(Number(r.avg_queue_time))
          : null,
        retryRate: retry && retry.total > 0
          ? Number((retry.retried / retry.total).toFixed(3))
          : 0,
      };
    });
  })

  // Slowest jobs by average duration
  .get("/jobs/slowest", async ({ query }) => {
    const weeks = Number(query?.weeks) || 8;
    const since = weeksAgoISO(weeks);

    const rows = await db.execute(sql`
      SELECT
        j.name,
        j.stage,
        count(*)::int AS run_count,
        round(avg(j.duration_seconds::numeric), 1) AS avg_duration,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY j.duration_seconds::numeric)
          AS p90_duration
      FROM pipeline_jobs j
      JOIN pipelines p ON p.id = j.pipeline_id
      WHERE p.gitlab_created_at >= ${since}
        AND j.duration_seconds IS NOT NULL
        AND j.retried = false
      GROUP BY j.name, j.stage
      ORDER BY avg_duration DESC
      LIMIT 30
    `);

    return (rows as any[]).map((r) => ({
      name: r.name,
      stage: r.stage,
      runCount: r.run_count,
      avgDuration: Number(r.avg_duration),
      p90Duration: r.p90_duration ? Math.round(Number(r.p90_duration)) : null,
    }));
  })

  // Most retried (flaky) jobs
  .get("/jobs/flaky", async ({ query }) => {
    const weeks = Number(query?.weeks) || 8;
    const since = weeksAgoISO(weeks);

    const rows = await db.execute(sql`
      SELECT
        j.name,
        j.stage,
        count(*)::int AS total_runs,
        count(*) FILTER (WHERE j.retried = true)::int AS retry_count,
        round(
          count(*) FILTER (WHERE j.retried = true)::numeric / count(*)::numeric,
          3
        ) AS retry_rate
      FROM pipeline_jobs j
      JOIN pipelines p ON p.id = j.pipeline_id
      WHERE p.gitlab_created_at >= ${since}
      GROUP BY j.name, j.stage
      HAVING count(*) FILTER (WHERE j.retried = true) > 0
      ORDER BY retry_count DESC
      LIMIT 30
    `);

    return (rows as any[]).map((r) => ({
      name: r.name,
      stage: r.stage,
      totalRuns: r.total_runs,
      retryCount: r.retry_count,
      retryRate: Number(r.retry_rate),
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
        (SELECT count(*)::int FROM pipelines p WHERE p.ref = mr.branch_name) AS pipeline_count
      FROM merge_requests mr
      WHERE EXISTS (SELECT 1 FROM pipelines p WHERE p.ref = mr.branch_name)
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

    const mrRows = await db.execute(sql`
      SELECT branch_name FROM merge_requests WHERE id = ${mrId}
    `);

    if ((mrRows as any[]).length === 0) {
      return [];
    }

    const branchName = (mrRows as any[])[0].branch_name;

    const rows = await db.execute(sql`
      SELECT
        p.id, p.ref, p.status, p.source, p.duration_seconds,
        p.web_url, p.gitlab_created_at, p.started_at, p.finished_at,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id) AS job_count,
        (SELECT count(*)::int FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.retried = true) AS retried_job_count
      FROM pipelines p
      WHERE p.ref = ${branchName}
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
