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
  });
