import { Elysia } from "elysia";
import { sql } from "drizzle-orm";
import { queryRows } from "../../db";
import { computeCriticalPath, type CriticalPathJob } from "@isaac/shared";
import type { CriticalPathFrequencyItem } from "@isaac/shared";
import {
  DAYS,
  MERGE_OR_TRAIN,
  RELEVANT_JOB,
  isoRange,
  pipelineWindow,
  scopeFilterSql,
  toCriticalPathJob,
  type JobRow,
} from "./shared";

/** Enough example pipelines to click through, without bloating the response. */
const MAX_EXAMPLES = 3;

type PipelineJobRow = JobRow & { pipeline_id: number };

interface JobAggregate {
  stage: string;
  criticalCount: number;
  contributionSum: number;
  exampleCritical: number[];
  exampleNonCritical: number[];
}

export const criticalPathRoutes = new Elysia().get(
  "/critical-path-frequency",
  async ({ query }) => {
    const { since, until } = isoRange(query, DAYS.week);
    const scope = query?.scope as string | undefined;

    const rows = await queryRows<PipelineJobRow>(sql`
      WITH pipeline_ids AS (
        SELECT p.id FROM pipelines p
        WHERE p.status = 'success'
          AND ${MERGE_OR_TRAIN}
          AND p.gitlab_created_at >= ${since} AND p.gitlab_created_at <= ${until}
          AND p.started_at IS NOT NULL AND p.finished_at IS NOT NULL
          ${scopeFilterSql(scope)}
      )
      SELECT p.id AS pipeline_id,
             j.name, j.stage, j.status, j.retried, j.duration_seconds,
             j.queued_duration_seconds, j.needs, j.started_at, j.finished_at
      FROM pipeline_ids p
      JOIN pipeline_jobs j ON j.pipeline_id = p.id
      WHERE ${RELEVANT_JOB}
      ORDER BY p.id, j.started_at NULLS LAST
    `);

    const pipelines = new Map<number, CriticalPathJob[]>();
    for (const r of rows) {
      const id = Number(r.pipeline_id);
      const jobs = pipelines.get(id) ?? [];
      jobs.push(toCriticalPathJob(r));
      pipelines.set(id, jobs);
    }

    const aggregates = new Map<string, JobAggregate>();
    let pipelinesAnalyzed = 0;

    for (const [pipelineId, jobs] of pipelines) {
      const window = pipelineWindow(jobs);
      if (!window) continue;

      const { criticalJobs } = computeCriticalPath(jobs, window.startMs, window.endMs);
      pipelinesAnalyzed++;

      for (const jobName of criticalJobs) {
        const job = jobs.find((j) => j.name === jobName && !j.retried);
        if (!job?.startedAt || !job.finishedAt) continue;

        const durationSeconds =
          (new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;

        const agg = aggregates.get(jobName) ?? {
          stage: job.stage,
          criticalCount: 0,
          contributionSum: 0,
          exampleCritical: [],
          exampleNonCritical: [],
        };
        agg.criticalCount++;
        agg.contributionSum += durationSeconds;
        if (agg.exampleCritical.length < MAX_EXAMPLES) {
          agg.exampleCritical.push(pipelineId);
        }
        aggregates.set(jobName, agg);
      }

      // Counter-examples: the same job in a pipeline where it wasn't critical.
      for (const job of jobs) {
        if (job.retried || criticalJobs.has(job.name)) continue;
        const agg = aggregates.get(job.name);
        if (
          agg &&
          agg.exampleNonCritical.length < MAX_EXAMPLES &&
          !agg.exampleNonCritical.includes(pipelineId)
        ) {
          agg.exampleNonCritical.push(pipelineId);
        }
      }
    }

    if (pipelinesAnalyzed === 0) return [];

    const items: CriticalPathFrequencyItem[] = [...aggregates].map(
      ([jobName, agg]) => ({
        jobName,
        stage: agg.stage,
        frequency: agg.criticalCount / pipelinesAnalyzed,
        pipelinesAnalyzed,
        pipelinesCritical: agg.criticalCount,
        avgContributionSeconds: Math.round(agg.contributionSum / agg.criticalCount),
        exampleCritical: agg.exampleCritical,
        exampleNonCritical: agg.exampleNonCritical,
      })
    );

    items.sort((a, b) => b.frequency - a.frequency);
    return items;
  }
);
