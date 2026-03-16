import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { pipelines, pipelineJobs } from "../db/schema";
import { computeCriticalPath, type JobInput } from "../lib/criticalPath";
import type { CriticalPathFrequencyItem } from "@isaac/shared";

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
        ) AS job_duration_sum,
        EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.name LIKE 'backend_tests%' AND j.retried = false) AS has_backend,
        EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND (j.name = 'frontend_tests' OR j.name = 'cypress_component_tests') AND j.retried = false) AS has_frontend
      FROM pipelines p
      WHERE p.status = 'success'
        AND p.duration_seconds IS NOT NULL
        AND p.ref LIKE 'refs/merge-requests/%'
        AND (p.ref LIKE '%/merge' OR p.ref LIKE '%/train')
        AND p.gitlab_created_at >= ${since}
        AND p.gitlab_created_at <= ${until}
      ORDER BY p.gitlab_created_at
    `);

    return (rows as any[]).map((r) => {
      const hasBackend = r.has_backend;
      const hasFrontend = r.has_frontend;
      const scope = hasBackend && hasFrontend ? "fullstack" : hasBackend ? "backend" : hasFrontend ? "frontend" : "neither";
      return {
        id: Number(r.id),
        type: (r.ref as string).endsWith("/train") ? "train" : "merge",
        scope,
        durationSeconds: r.duration_seconds,
        queuedDurationSeconds: r.queued_duration_seconds != null ? Number(r.queued_duration_seconds) : null,
        createdAt: new Date(r.gitlab_created_at).toISOString(),
        webUrl: r.web_url,
        jobCount: r.job_count,
        retriedJobCount: r.retried_job_count,
        jobDurationSum: r.job_duration_sum != null ? Number(r.job_duration_sum) : null,
      };
    });
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
        d.name, d.stage, d.run_count, d.avg_duration, d.p10_duration, d.p50_duration, d.p90_duration, d.stddev_duration, d.avg_queued_duration, d.p50_queued_duration,
        COALESCE(r.retry_count, 0) AS retry_count,
        n.needs
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
      p10Duration: r.p10_duration != null ? Math.round(Number(r.p10_duration)) : null,
      p50Duration: r.p50_duration != null ? Math.round(Number(r.p50_duration)) : null,
      p90Duration: r.p90_duration != null ? Math.round(Number(r.p90_duration)) : null,
      stddevDuration: r.stddev_duration != null ? Number(r.stddev_duration) : null,
      avgQueuedDuration: r.avg_queued_duration != null ? Number(r.avg_queued_duration) : null,
      p50QueuedDuration: r.p50_queued_duration != null ? Math.round(Number(r.p50_queued_duration)) : null,
      retryCount: r.retry_count,
      needs: r.needs ?? null,
    }));
  })

  // Job retry trend: sparkline data (4 weeks)
  .get("/job-retry-trend", async ({ query }) => {
    const until = query?.until || new Date().toISOString();

    const rows = await db.execute(sql`
      WITH bounds AS (
        SELECT date_trunc('week', gs)::date AS week_start
        FROM generate_series(
          date_trunc('week', ${until}::timestamptz) - INTERVAL '3 weeks',
          date_trunc('week', ${until}::timestamptz),
          '1 week'
        ) AS gs
      ),
      pipeline_ids AS (
        SELECT id, date_trunc('week', gitlab_created_at)::date AS week_start
        FROM pipelines
        WHERE status = 'success'
          AND ref LIKE 'refs/merge-requests/%'
          AND (ref LIKE '%/merge' OR ref LIKE '%/train')
          AND gitlab_created_at >= date_trunc('week', ${until}::timestamptz) - INTERVAL '3 weeks'
          AND gitlab_created_at < date_trunc('week', ${until}::timestamptz) + INTERVAL '1 week'
      ),
      job_runs AS (
        SELECT
          j.name,
          p.week_start,
          COUNT(*) FILTER (WHERE j.retried = false AND j.duration_seconds IS NOT NULL) AS run_count,
          COUNT(*) FILTER (WHERE j.retried = true) AS retry_count
        FROM pipeline_jobs j
        JOIN pipeline_ids p ON p.id = j.pipeline_id
        WHERE j.stage != 'security' AND j.name != 'pages'
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

    // Group by job name
    const byJob = new Map<string, { weekStart: string; runCount: number; retryCount: number; retryRate: number }[]>();
    for (const r of rows as any[]) {
      const name = r.name as string;
      if (!byJob.has(name)) byJob.set(name, []);
      byJob.get(name)!.push({
        weekStart: new Date(r.week_start).toISOString().slice(0, 10),
        runCount: Number(r.run_count),
        retryCount: Number(r.retry_count),
        retryRate: Number(r.retry_rate),
      });
    }

    function classifySeverity(weeks: { retryRate: number }[]): "healthy" | "improving" | "worsening" | "chronic" {
      if (weeks.length < 2) return "healthy";
      const rates = weeks.map(w => w.retryRate);
      const slope = rates[rates.length - 1] - rates[0];
      const THRESHOLD = 5;
      const DELTA = 5;
      if (rates.every(r => r < THRESHOLD)) return "healthy";
      if (rates.filter(r => r >= THRESHOLD).length >= 3 && Math.abs(slope) < DELTA) return "chronic";
      if (slope >= DELTA) return "worsening";
      if (slope <= -DELTA) return "improving";
      return "chronic";
    }

    const result = [];
    for (const [name, weeks] of byJob) {
      const slope = weeks[weeks.length - 1].retryRate - weeks[0].retryRate;
      const severity = classifySeverity(weeks);
      result.push({ name, weeks, slope, severity });
    }

    return result;
  })

  // Critical path frequency: per-pipeline critical path analysis
  .get("/critical-path-frequency", async ({ query }) => {
    const since = query?.since
      || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = query?.until || new Date().toISOString();
    const scope = query?.scope as string | undefined;

    const scopeFilter = scope
      ? sql`AND (
          CASE
            WHEN EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.name LIKE 'backend_tests%' AND j.retried = false)
             AND EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND (j.name = 'frontend_tests' OR j.name = 'cypress_component_tests') AND j.retried = false)
            THEN 'fullstack'
            WHEN EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND j.name LIKE 'backend_tests%' AND j.retried = false)
            THEN 'backend'
            WHEN EXISTS (SELECT 1 FROM pipeline_jobs j WHERE j.pipeline_id = p.id AND (j.name = 'frontend_tests' OR j.name = 'cypress_component_tests') AND j.retried = false)
            THEN 'frontend'
            ELSE 'neither'
          END = ${scope}
        )`
      : sql``;

    const rows = await db.execute(sql`
      WITH pipeline_ids AS (
        SELECT p.id FROM pipelines p
        WHERE p.status = 'success'
          AND p.ref LIKE 'refs/merge-requests/%'
          AND (p.ref LIKE '%/merge' OR p.ref LIKE '%/train')
          AND p.gitlab_created_at >= ${since} AND p.gitlab_created_at <= ${until}
          AND p.started_at IS NOT NULL AND p.finished_at IS NOT NULL
          ${scopeFilter}
      )
      SELECT p.id AS pipeline_id,
             j.name, j.stage, j.status, j.retried, j.duration_seconds,
             j.queued_duration_seconds, j.needs, j.started_at, j.finished_at
      FROM pipeline_ids p
      JOIN pipeline_jobs j ON j.pipeline_id = p.id
      WHERE j.stage != 'security' AND j.name != 'pages'
      ORDER BY p.id, j.started_at NULLS LAST
    `);

    // Group rows by pipeline_id
    const pipelineMap = new Map<number, JobInput[]>();

    for (const r of rows as any[]) {
      const pid = Number(r.pipeline_id);
      if (!pipelineMap.has(pid)) {
        pipelineMap.set(pid, []);
      }
      pipelineMap.get(pid)!.push({
        name: r.name,
        stage: r.stage,
        retried: r.retried,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        queuedDurationSeconds: r.queued_duration_seconds != null ? Number(r.queued_duration_seconds) : null,
        needs: r.needs ?? null,
      });
    }

    // Compute critical path for each pipeline, aggregate per-job
    const MAX_EXAMPLES = 3;
    const jobAgg = new Map<string, {
      stage: string;
      criticalCount: number;
      contributionSum: number;
      exampleCritical: number[];
      exampleNonCritical: number[];
    }>();
    // Track all job names seen so we can fill non-critical examples
    const allJobNames = new Set<string>();
    let pipelinesAnalyzed = 0;

    for (const [pipelineId, jobs] of pipelineMap) {
      // Collect job names present in this pipeline
      for (const j of jobs) {
        if (!j.retried) allJobNames.add(j.name);
      }

      // Compute window from actual job timestamps (not pipeline-level timestamps
      // which include filtered-out security/pages jobs)
      let startMs = Infinity;
      let endMs = -Infinity;
      for (const j of jobs) {
        if (j.retried || !j.startedAt || !j.finishedAt) continue;
        let s = new Date(j.startedAt).getTime();
        if (j.queuedDurationSeconds && j.queuedDurationSeconds > 0) {
          s -= j.queuedDurationSeconds * 1000;
        }
        if (s < startMs) startMs = s;
        const f = new Date(j.finishedAt).getTime();
        if (f > endMs) endMs = f;
      }
      if (endMs <= startMs) continue;

      const result = computeCriticalPath(jobs, startMs, endMs);
      pipelinesAnalyzed++;

      // Record critical jobs
      for (const jobName of result.criticalJobs) {
        const job = jobs.find((j) => j.name === jobName && !j.retried);
        if (!job || !job.startedAt || !job.finishedAt) continue;

        const durationSeconds = (new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;

        if (!jobAgg.has(jobName)) {
          jobAgg.set(jobName, { stage: job.stage, criticalCount: 0, contributionSum: 0, exampleCritical: [], exampleNonCritical: [] });
        }
        const agg = jobAgg.get(jobName)!;
        agg.criticalCount++;
        agg.contributionSum += durationSeconds;
        if (agg.exampleCritical.length < MAX_EXAMPLES) {
          agg.exampleCritical.push(pipelineId);
        }
      }

      // Record non-critical examples for jobs present but not on the critical path
      for (const j of jobs) {
        if (j.retried || result.criticalJobs.has(j.name)) continue;
        const agg = jobAgg.get(j.name);
        if (agg && agg.exampleNonCritical.length < MAX_EXAMPLES && !agg.exampleNonCritical.includes(pipelineId)) {
          agg.exampleNonCritical.push(pipelineId);
        }
      }
    }

    if (pipelinesAnalyzed === 0) return [];

    const items: CriticalPathFrequencyItem[] = [];
    for (const [jobName, agg] of jobAgg) {
      items.push({
        jobName,
        stage: agg.stage,
        frequency: agg.criticalCount / pipelinesAnalyzed,
        pipelinesAnalyzed,
        pipelinesCritical: agg.criticalCount,
        avgContributionSeconds: Math.round(agg.contributionSum / agg.criticalCount),
        exampleCritical: agg.exampleCritical,
        exampleNonCritical: agg.exampleNonCritical,
      });
    }

    items.sort((a, b) => b.frequency - a.frequency);
    return items;
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
        durationSeconds: j.duration_seconds != null ? Number(j.duration_seconds) : null,
        queuedDurationSeconds: j.queued_duration_seconds != null ? Number(j.queued_duration_seconds) : null,
        allowFailure: j.allow_failure,
        retried: j.retried,
        needs: j.needs ?? null,
        webUrl: j.web_url,
        startedAt: j.started_at ? new Date(j.started_at).toISOString() : null,
        finishedAt: j.finished_at ? new Date(j.finished_at).toISOString() : null,
      })),
    };
  })

  // Merge requests with pipeline counts and CI cost summary
  .get("/merge-requests", async ({ query }) => {
    const limit = Math.min(Number(query?.limit) || 50, 200);
    const search = query?.search?.trim() || null;
    const since = query?.since
      || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // When searching, ignore the date filter so we can find older MRs
    const sinceFilter = search ? sql`` : sql`AND p.gitlab_created_at >= ${since}`;
    const searchFilter = search ? sql`AND mr.title ILIKE ${'%' + search + '%'}` : sql``;

    const rows = await db.execute(sql`
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

    return (rows as any[]).map((r) => ({
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
      firstPipelineAt: r.first_pipeline_at ? new Date(r.first_pipeline_at).toISOString() : null,
      lastPipelineAt: r.last_pipeline_at ? new Date(r.last_pipeline_at).toISOString() : null,
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
