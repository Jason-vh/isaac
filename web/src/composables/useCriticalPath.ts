import type { PipelineJobDetail, JobStats } from "@isaac/shared";

export interface CriticalPathResult {
  criticalJobs: Set<string>;
  slack: Map<string, number>; // seconds of slack per job name
}

const EPSILON_MS = 500;

/**
 * Compute the critical path for a single pipeline's real job timestamps.
 *
 * Algorithm:
 * 1. Build name→job map (non-retried jobs with both startedAt and finishedAt)
 * 2. Forward pass: EST = startedAt - pipelineStart, EFT = finishedAt - pipelineStart
 * 3. Build consumer map (who depends on me?)
 * 4. Backward pass: LFT = min(LST of consumers), or pipelineEnd if none. LST = LFT - duration
 * 5. Slack = LST - EST. Critical if slack < epsilon.
 */
export function computeCriticalPath(
  jobs: PipelineJobDetail[],
  pipelineStart: number,
  pipelineEnd: number,
): CriticalPathResult {
  const totalMs = pipelineEnd - pipelineStart;
  if (totalMs <= 0) return { criticalJobs: new Set(), slack: new Map() };

  // Step 1: build name→job map, only non-retried jobs with timestamps
  const jobMap = new Map<string, PipelineJobDetail>();
  for (const j of jobs) {
    if (j.retried || !j.startedAt || !j.finishedAt) continue;
    jobMap.set(j.name, j);
  }

  // Step 2: forward pass – EST and EFT in ms relative to pipelineStart
  const est = new Map<string, number>();
  const eft = new Map<string, number>();

  for (const [name, job] of jobMap) {
    est.set(name, new Date(job.startedAt!).getTime() - pipelineStart);
    eft.set(name, new Date(job.finishedAt!).getTime() - pipelineStart);
  }

  // Step 3: build consumer map (name → names that list it in needs)
  const consumers = new Map<string, string[]>();
  for (const [name] of jobMap) consumers.set(name, []);

  for (const [name, job] of jobMap) {
    if (!job.needs) continue;
    for (const dep of job.needs) {
      if (jobMap.has(dep)) {
        consumers.get(dep)!.push(name);
      }
    }
  }

  // Step 4: backward pass – LFT and LST
  const lft = new Map<string, number>();
  const lst = new Map<string, number>();

  for (const [name, job] of jobMap) {
    const jobConsumers = consumers.get(name)!;
    let latestFinish: number;
    if (jobConsumers.length === 0) {
      latestFinish = totalMs;
    } else {
      // LFT = min(LST of consumers) — but we need LST of consumers first
      // We need to process in reverse topological order. Do a simple recursive resolve.
      latestFinish = totalMs; // will be overwritten below
    }
    lft.set(name, latestFinish);
  }

  // Recursive resolve for backward pass
  function resolveLFT(name: string): number {
    if (lft.has(name) && lst.has(name)) return lft.get(name)!;

    const jobConsumers = consumers.get(name) || [];
    let latestFinish: number;
    if (jobConsumers.length === 0) {
      latestFinish = totalMs;
    } else {
      latestFinish = Math.min(...jobConsumers.map((c) => resolveLST(c)));
    }
    const duration = eft.get(name)! - est.get(name)!;
    lft.set(name, latestFinish);
    lst.set(name, latestFinish - duration);
    return latestFinish;
  }

  function resolveLST(name: string): number {
    if (lst.has(name)) return lst.get(name)!;
    resolveLFT(name);
    return lst.get(name)!;
  }

  // Clear pre-filled values and resolve properly
  lft.clear();
  lst.clear();

  for (const [name] of jobMap) {
    resolveLFT(name);
  }

  // Step 5: compute slack
  const slack = new Map<string, number>();
  const criticalJobs = new Set<string>();

  for (const [name] of jobMap) {
    const s = (lst.get(name)! - est.get(name)!);
    slack.set(name, s / 1000); // convert to seconds for display
    if (Math.abs(s) < EPSILON_MS) {
      criticalJobs.add(name);
    }
  }

  return { criticalJobs, slack };
}

/**
 * Compute the critical path for the aggregate Gantt view using simulated P50 timings.
 *
 * Same backward-pass algorithm but uses pre-computed startTimes/endTimes from
 * the forward scheduling pass in JobGanttChart.
 */
export function computeSimulatedCriticalPath(
  jobs: JobStats[],
  startTimes: Map<string, number>,
  endTimes: Map<string, number>,
  maxTime: number,
): CriticalPathResult {
  if (maxTime <= 0) return { criticalJobs: new Set(), slack: new Map() };

  const jobMap = new Map(jobs.map((j) => [j.name, j]));

  // Build consumer map
  const consumers = new Map<string, string[]>();
  for (const j of jobs) consumers.set(j.name, []);

  for (const j of jobs) {
    for (const dep of j.needs) {
      if (consumers.has(dep)) {
        consumers.get(dep)!.push(j.name);
      }
    }
  }

  // Backward pass
  const lft = new Map<string, number>();
  const lst = new Map<string, number>();

  function resolveLFT(name: string): number {
    if (lft.has(name)) return lft.get(name)!;

    const jobConsumers = consumers.get(name) || [];
    let latestFinish: number;
    if (jobConsumers.length === 0) {
      latestFinish = maxTime;
    } else {
      latestFinish = Math.min(...jobConsumers.map((c) => resolveLST(c)));
    }

    const start = startTimes.get(name) ?? 0;
    const end = endTimes.get(name) ?? 0;
    const duration = end - start;

    lft.set(name, latestFinish);
    lst.set(name, latestFinish - duration);
    return latestFinish;
  }

  function resolveLST(name: string): number {
    if (lst.has(name)) return lst.get(name)!;
    resolveLFT(name);
    return lst.get(name)!;
  }

  for (const j of jobs) resolveLFT(j.name);

  // Compute slack (times are in seconds already)
  const EPSILON_S = 0.5;
  const slack = new Map<string, number>();
  const criticalJobs = new Set<string>();

  for (const j of jobs) {
    const est = startTimes.get(j.name) ?? 0;
    const s = (lst.get(j.name) ?? 0) - est;
    slack.set(j.name, s);
    if (Math.abs(s) < EPSILON_S) {
      criticalJobs.add(j.name);
    }
  }

  return { criticalJobs, slack };
}
