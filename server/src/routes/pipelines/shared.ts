import { sql, type SQL } from "drizzle-orm";
import type { CriticalPathJob } from "@isaac/shared";
import { parseRange } from "../../lib/request";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only MR pipelines are comparable; branch and scheduled runs do different work. */
export const MERGE_OR_TRAIN = sql`
  p.ref LIKE 'refs/merge-requests/%'
  AND (p.ref LIKE '%/merge' OR p.ref LIKE '%/train')
`;

/** The dashboard omits the GitLab Pages deployment job. */
export const RELEVANT_JOB = sql`j.name != 'pages'`;

/** Scope filter: requires the pipelines table to be aliased as `p`. */
export function scopeFilterSql(scope: string | undefined): SQL {
  if (!scope) return sql``;
  return sql`AND (
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
  )`;
}

/** A validated `since`/`until` window as ISO strings, for raw SQL binding. */
export function isoRange(
  query: Record<string, string | undefined>,
  defaultDays: number
): { since: string; until: string } {
  const { since, until } = parseRange(query, defaultDays);
  return { since: since.toISOString(), until: until.toISOString() };
}

export const DAYS = { week: 7, month: 30 };

/** The columns every pipeline listing selects. */
export interface PipelineRow {
  id: number;
  ref: string | null;
  status: string;
  source: string | null;
  duration_seconds: number | null;
  web_url: string;
  gitlab_created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  job_count: number;
  retried_job_count: number;
}

export function toIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function mapPipelineRow(r: PipelineRow) {
  return {
    id: Number(r.id),
    ref: r.ref,
    status: r.status,
    source: r.source,
    durationSeconds: r.duration_seconds,
    jobCount: r.job_count,
    retriedJobCount: r.retried_job_count,
    webUrl: r.web_url,
    gitlabCreatedAt: new Date(r.gitlab_created_at).toISOString(),
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
  };
}

/** The job columns the critical-path analysis needs. */
export interface JobRow {
  name: string;
  stage: string;
  retried: boolean;
  queued_duration_seconds: string | number | null;
  needs: string[] | null;
  started_at: Date | null;
  finished_at: Date | null;
}

export function toCriticalPathJob(r: JobRow): CriticalPathJob {
  return {
    name: r.name,
    stage: r.stage,
    retried: r.retried,
    startedAt: toIso(r.started_at),
    finishedAt: toIso(r.finished_at),
    queuedDurationSeconds:
      r.queued_duration_seconds != null ? Number(r.queued_duration_seconds) : null,
    needs: r.needs ?? null,
  };
}

/**
 * The window a pipeline's jobs actually span, queue time included.
 *
 * Derived from job timestamps rather than the pipeline's own, which also cover
 * the Pages job this analysis filters out.
 */
export function pipelineWindow(
  jobs: CriticalPathJob[]
): { startMs: number; endMs: number } | null {
  let startMs = Infinity;
  let endMs = -Infinity;

  for (const j of jobs) {
    if (j.retried || !j.startedAt || !j.finishedAt) continue;
    let start = new Date(j.startedAt).getTime();
    if (j.queuedDurationSeconds && j.queuedDurationSeconds > 0) {
      start -= j.queuedDurationSeconds * 1000;
    }
    if (start < startMs) startMs = start;
    const finish = new Date(j.finishedAt).getTime();
    if (finish > endMs) endMs = finish;
  }

  return endMs > startMs ? { startMs, endMs } : null;
}

/** Every calendar day in a range, so charts have no gaps. */
export function daysBetween(since: string, until: string): string[] {
  const days: string[] = [];
  const end = new Date(until).getTime();
  for (let t = new Date(since).getTime(); t <= end; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}
