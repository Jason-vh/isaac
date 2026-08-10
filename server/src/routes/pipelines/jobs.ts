import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { queryRows } from "../../db";
import { computeCriticalPath } from "@isaac/shared";
import {
  DAYS,
  MERGE_OR_TRAIN,
  RELEVANT_JOB,
  daysBetween,
  isoRange,
  pipelineWindow,
  scopeFilterSql,
  toCriticalPathJob,
  type JobRow,
} from "./shared";

// A job is flaky enough to care about at a 5% retry rate, and a 5-point move
// between the first and last week is a real trend rather than noise.
const RETRY_RATE_THRESHOLD = 5;
const RETRY_RATE_DELTA = 5;

type Severity = "healthy" | "improving" | "worsening" | "chronic";

interface JobStatsRow {
  name: string;
  stage: string;
  run_count: number;
  avg_duration: string | null;
  p10_duration: string | null;
  p50_duration: string | null;
  p90_duration: string | null;
  stddev_duration: string | null;
  avg_queued_duration: string | null;
  p50_queued_duration: string | null;
  retry_count: number;
  needs: string[] | null;
}

interface RetryTrendRow {
  name: string;
  week_start: Date;
  run_count: string | number;
  retry_count: string | number;
  retry_rate: string | number;
}

interface DayStatsRow {
  day: Date;
  p50_duration: string | null;
  run_count: number;
  retry_count: number;
}

type DayJobRow = JobRow & { pipeline_id: number; day: Date };

const round = (value: string | null): number | null =>
  value != null ? Math.round(Number(value)) : null;

function classifySeverity(rates: number[]): Severity {
  if (rates.length < 2) return "healthy";
  if (rates.every((r) => r < RETRY_RATE_THRESHOLD)) return "healthy";

  const slope = rates[rates.length - 1] - rates[0];
  const persistentlyHigh =
    rates.filter((r) => r >= RETRY_RATE_THRESHOLD).length >= 3;

  if (persistentlyHigh && Math.abs(slope) < RETRY_RATE_DELTA) return "chronic";
  if (slope >= RETRY_RATE_DELTA) return "worsening";
  if (slope <= -RETRY_RATE_DELTA) return "improving";
  return "chronic";
}

export const jobRoutes = new Elysia()
  // Duration, queue time and retry counts per job name
  .get("/job-stats", async ({ query }) => {
    const { since, until } = isoRange(query, DAYS.week);
    const scope = query?.scope as string | undefined;

    const rows = await queryRows<JobStatsRow>(sql`
      WITH pipeline_ids AS (
        SELECT p.id FROM pipelines p
        WHERE p.status = 'success'
          AND ${MERGE_OR_TRAIN}
          AND p.gitlab_created_at >= ${since}
          AND p.gitlab_created_at <= ${until}
          ${scopeFilterSql(scope)}
      ),
      duration_stats AS (
        SELECT
          j.name,
          j.stage,
          count(*)::int AS run_count,
          round(avg(j.duration_seconds::numeric), 1) AS avg_duration,
          percentile_cont(0.1) WITHIN GROUP (ORDER BY j.duration_seconds::numeric) AS p10_duration,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY j.duration_seconds::numeric) AS p50_duration,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY j.duration_seconds::numeric) AS p90_duration,
          round(stddev(j.duration_seconds::numeric), 1) AS stddev_duration,
          round(avg(CASE WHEN j.queued_duration_seconds IS NOT NULL THEN j.queued_duration_seconds::numeric END), 1) AS avg_queued_duration,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY j.queued_duration_seconds::numeric) FILTER (WHERE j.queued_duration_seconds IS NOT NULL) AS p50_queued_duration
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = false
          AND j.duration_seconds IS NOT NULL
          AND ${RELEVANT_JOB}
        GROUP BY j.name, j.stage
      ),
      retry_counts AS (
        SELECT j.name, count(*)::int AS retry_count
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = true
          AND ${RELEVANT_JOB}
        GROUP BY j.name
      ),
      job_needs AS (
        SELECT DISTINCT ON (j.name)
          j.name,
          j.needs
        FROM pipeline_jobs j
        WHERE j.pipeline_id IN (SELECT id FROM pipeline_ids)
          AND j.retried = false
          AND ${RELEVANT_JOB}
        ORDER BY j.name, j.pipeline_id DESC
      )
      SELECT
        d.name, d.stage, d.run_count, d.avg_duration, d.p10_duration, d.p50_duration,
        d.p90_duration, d.stddev_duration, d.avg_queued_duration, d.p50_queued_duration,
        COALESCE(r.retry_count, 0) AS retry_count,
        n.needs
      FROM duration_stats d
      LEFT JOIN retry_counts r ON r.name = d.name
      LEFT JOIN job_needs n ON n.name = d.name
      ORDER BY d.p50_duration DESC
    `);

    return rows.map((r) => ({
      name: r.name,
      stage: r.stage,
      runCount: r.run_count,
      avgDuration: Number(r.avg_duration),
      p10Duration: round(r.p10_duration),
      p50Duration: round(r.p50_duration),
      p90Duration: round(r.p90_duration),
      stddevDuration: r.stddev_duration != null ? Number(r.stddev_duration) : null,
      avgQueuedDuration:
        r.avg_queued_duration != null ? Number(r.avg_queued_duration) : null,
      p50QueuedDuration: round(r.p50_queued_duration),
      retryCount: r.retry_count,
      needs: r.needs ?? null,
    }));
  })

  // Four-week retry-rate sparkline per job
  .get("/job-retry-trend", async ({ query }) => {
    const { until } = isoRange(query, DAYS.month);
    const scope = query?.scope as string | undefined;

    const rows = await queryRows<RetryTrendRow>(sql`
      WITH bounds AS (
        SELECT date_trunc('week', gs)::date AS week_start
        FROM generate_series(
          date_trunc('week', ${until}::timestamptz) - INTERVAL '3 weeks',
          date_trunc('week', ${until}::timestamptz),
          '1 week'
        ) AS gs
      ),
      pipeline_ids AS (
        SELECT p.id, date_trunc('week', p.gitlab_created_at)::date AS week_start
        FROM pipelines p
        WHERE p.status = 'success'
          AND ${MERGE_OR_TRAIN}
          AND p.gitlab_created_at >= date_trunc('week', ${until}::timestamptz) - INTERVAL '3 weeks'
          AND p.gitlab_created_at < date_trunc('week', ${until}::timestamptz) + INTERVAL '1 week'
          ${scopeFilterSql(scope)}
      ),
      job_runs AS (
        SELECT
          j.name,
          p.week_start,
          COUNT(*) FILTER (WHERE j.retried = false AND j.duration_seconds IS NOT NULL) AS run_count,
          COUNT(*) FILTER (WHERE j.retried = true) AS retry_count
        FROM pipeline_jobs j
        JOIN pipeline_ids p ON p.id = j.pipeline_id
        WHERE ${RELEVANT_JOB}
        GROUP BY j.name, p.week_start
      ),
      job_names AS (
        SELECT name FROM job_runs GROUP BY name HAVING SUM(run_count + retry_count) >= 2
      ),
      filled AS (
        SELECT
          jn.name, b.week_start,
          COALESCE(r.run_count, 0) AS run_count,
          COALESCE(r.retry_count, 0) AS retry_count
        FROM job_names jn
        CROSS JOIN bounds b
        LEFT JOIN job_runs r ON r.name = jn.name AND r.week_start = b.week_start
      )
      SELECT name, week_start, run_count, retry_count,
        CASE WHEN run_count + retry_count > 0
          THEN round((retry_count::numeric / (run_count + retry_count)) * 100, 1)
          ELSE 0
        END AS retry_rate
      FROM filled
      ORDER BY name, week_start
    `);

    const byJob = new Map<
      string,
      { weekStart: string; runCount: number; retryCount: number; retryRate: number }[]
    >();
    for (const r of rows) {
      const weeks = byJob.get(r.name) ?? [];
      weeks.push({
        weekStart: new Date(r.week_start).toISOString().slice(0, 10),
        runCount: Number(r.run_count),
        retryCount: Number(r.retry_count),
        retryRate: Number(r.retry_rate),
      });
      byJob.set(r.name, weeks);
    }

    return [...byJob].map(([name, weeks]) => ({
      name,
      weeks,
      slope: weeks[weeks.length - 1].retryRate - weeks[0].retryRate,
      severity: classifySeverity(weeks.map((w) => w.retryRate)),
    }));
  })

  // Per-day duration, retry rate and critical-path share for one job
  .get("/job-timeline", async ({ query }) => {
    const jobName = query?.job as string | undefined;
    if (!jobName) return [];

    const { since, until } = isoRange(query, DAYS.week);
    const scope = query?.scope as string | undefined;

    const statsRows = await queryRows<DayStatsRow>(sql`
      WITH pipeline_ids AS (
        SELECT p.id, p.gitlab_created_at::date AS day
        FROM pipelines p
        WHERE p.status = 'success'
          AND ${MERGE_OR_TRAIN}
          AND p.gitlab_created_at >= ${since} AND p.gitlab_created_at <= ${until}
          ${scopeFilterSql(scope)}
      )
      SELECT
        pi.day,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY j.duration_seconds::numeric) AS p50_duration,
        COUNT(*) FILTER (WHERE j.retried = false AND j.duration_seconds IS NOT NULL)::int AS run_count,
        COUNT(*) FILTER (WHERE j.retried = true)::int AS retry_count
      FROM pipeline_ids pi
      JOIN pipeline_jobs j ON j.pipeline_id = pi.id AND j.name = ${jobName}
      GROUP BY pi.day
      ORDER BY pi.day
    `);

    const dayStats = new Map<string, { p50: number; retryRate: number }>();
    for (const r of statsRows) {
      const total = Number(r.run_count) + Number(r.retry_count);
      dayStats.set(new Date(r.day).toISOString().slice(0, 10), {
        p50: round(r.p50_duration) ?? 0,
        retryRate: total > 0 ? Math.round((Number(r.retry_count) / total) * 1000) / 10 : 0,
      });
    }

    const cpRows = await queryRows<DayJobRow>(sql`
      WITH pipeline_ids AS (
        SELECT p.id, p.gitlab_created_at::date AS day
        FROM pipelines p
        WHERE p.status = 'success'
          AND ${MERGE_OR_TRAIN}
          AND p.gitlab_created_at >= ${since} AND p.gitlab_created_at <= ${until}
          AND p.started_at IS NOT NULL AND p.finished_at IS NOT NULL
          ${scopeFilterSql(scope)}
      )
      SELECT pi.id AS pipeline_id, pi.day,
             j.name, j.stage, j.retried, j.duration_seconds,
             j.queued_duration_seconds, j.needs, j.started_at, j.finished_at
      FROM pipeline_ids pi
      JOIN pipeline_jobs j ON j.pipeline_id = pi.id
      WHERE ${RELEVANT_JOB}
      ORDER BY pi.id, j.started_at NULLS LAST
    `);

    const pipelines = new Map<number, { day: string; jobs: ReturnType<typeof toCriticalPathJob>[] }>();
    for (const r of cpRows) {
      const id = Number(r.pipeline_id);
      const entry =
        pipelines.get(id) ??
        { day: new Date(r.day).toISOString().slice(0, 10), jobs: [] };
      entry.jobs.push(toCriticalPathJob(r));
      pipelines.set(id, entry);
    }

    const dayCritical = new Map<string, { total: number; critical: number }>();
    for (const { day, jobs } of pipelines.values()) {
      const counts = dayCritical.get(day) ?? { total: 0, critical: 0 };
      dayCritical.set(day, counts);

      if (!jobs.some((j) => j.name === jobName && !j.retried)) continue;
      counts.total++;

      const window = pipelineWindow(jobs);
      if (!window) continue;

      const { criticalJobs } = computeCriticalPath(jobs, window.startMs, window.endMs);
      if (criticalJobs.has(jobName)) counts.critical++;
    }

    return daysBetween(since, until).map((date) => {
      const stats = dayStats.get(date);
      const cp = dayCritical.get(date);
      return {
        date,
        p50Duration: stats?.p50 ?? null,
        retryRate: stats?.retryRate ?? 0,
        criticalPercent:
          cp && cp.total > 0 ? Math.round((cp.critical / cp.total) * 100) : null,
      };
    });
  });
