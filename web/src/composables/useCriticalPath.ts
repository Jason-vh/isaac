import type { CriticalPathResult, JobStats } from "@isaac/shared";
import { buildConsumers, latestStartTimes } from "@isaac/shared";

// The real-timestamp analysis lives in @isaac/shared so the API and the web app
// agree on which jobs are critical. Only the simulated variant is web-only.
export { computeCriticalPath } from "@isaac/shared";
export type { CriticalPathResult } from "@isaac/shared";

/** Times here are already in seconds, so a half-second is a tight enough fit. */
const EPSILON_SECONDS = 0.5;

/**
 * The critical path for the aggregate Gantt view, over the simulated P50
 * timings that JobGanttChart schedules rather than any real pipeline's clock.
 */
export function computeSimulatedCriticalPath(
  jobs: JobStats[],
  startTimes: Map<string, number>,
  endTimes: Map<string, number>,
  maxTime: number,
): CriticalPathResult {
  if (maxTime <= 0) return { criticalJobs: new Set(), slack: new Map() };

  const consumers = buildConsumers(jobs, (name) => startTimes.get(name) ?? 0);
  const latestStart = latestStartTimes(
    jobs.map((j) => j.name),
    consumers,
    (name) => (endTimes.get(name) ?? 0) - (startTimes.get(name) ?? 0),
    maxTime,
  );

  const criticalJobs = new Set<string>();
  const slack = new Map<string, number>();

  for (const job of jobs) {
    const value = (latestStart.get(job.name) ?? 0) - (startTimes.get(job.name) ?? 0);
    slack.set(job.name, value);
    if (Math.abs(value) < EPSILON_SECONDS) criticalJobs.add(job.name);
  }

  return { criticalJobs, slack };
}
