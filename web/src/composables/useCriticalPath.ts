import type { PipelineJobDetail, JobStats } from "@isaac/shared";

export interface CriticalPathResult {
  criticalJobs: Set<string>;
  slack: Map<string, number>; // seconds of slack per job name
}

// Proportional epsilon: 1% of pipeline duration (min 1s) to absorb runner
// queue time and GitLab scheduling latency between dependent jobs.
function computeEpsilon(totalMs: number): number {
  return Math.max(1000, totalMs * 0.01);
}

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
  // Use queue-adjusted start (startedAt - queuedDurationSeconds) so that runner
  // queue time doesn't appear as slack on predecessor jobs. Also use the earliest
  // start across ALL attempts (including retries) so that retry time is captured.
  const earliestStart = new Map<string, number>();
  for (const j of jobs) {
    if (!j.startedAt) continue;
    let start = new Date(j.startedAt).getTime();
    if (j.queuedDurationSeconds && j.queuedDurationSeconds > 0) {
      start -= j.queuedDurationSeconds * 1000;
    }
    const cur = earliestStart.get(j.name);
    if (cur === undefined || start < cur) earliestStart.set(j.name, start);
  }

  const est = new Map<string, number>();
  const eft = new Map<string, number>();

  for (const [name, job] of jobMap) {
    const adjStart = earliestStart.get(name) ?? new Date(job.startedAt!).getTime();
    est.set(name, adjStart - pipelineStart);
    eft.set(name, new Date(job.finishedAt!).getTime() - pipelineStart);
  }

  // Step 3: build consumer map (name → names that list it in needs)
  // For jobs with needs === null (stage-based ordering), infer deps from stage order
  const consumers = new Map<string, string[]>();
  for (const [name] of jobMap) consumers.set(name, []);

  // Determine stage order from earliest start times
  const stageStarts = new Map<string, number>();
  for (const [name, job] of jobMap) {
    const start = est.get(name)!;
    const cur = stageStarts.get(job.stage);
    if (cur === undefined || start < cur) stageStarts.set(job.stage, start);
  }
  const orderedStages = [...stageStarts.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([stage]) => stage);
  const stageIndex = new Map(orderedStages.map((s, i) => [s, i]));

  // Group jobs by stage
  const jobsByStage = new Map<string, string[]>();
  for (const [name, job] of jobMap) {
    if (!jobsByStage.has(job.stage)) jobsByStage.set(job.stage, []);
    jobsByStage.get(job.stage)!.push(name);
  }

  for (const [name, job] of jobMap) {
    if (job.needs === null) {
      // Stage-based ordering: depends on all jobs in prior stages
      const myIdx = stageIndex.get(job.stage) ?? 0;
      for (const [stage, idx] of stageIndex) {
        if (idx < myIdx) {
          for (const depName of jobsByStage.get(stage) || []) {
            consumers.get(depName)!.push(name);
          }
        }
      }
    } else {
      for (const dep of job.needs) {
        if (jobMap.has(dep)) {
          consumers.get(dep)!.push(name);
        }
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
    if (lft.has(name)) return lft.get(name)!;

    // Job not in jobMap (e.g. skipped/manual) — treat as unconstrained
    if (!est.has(name)) {
      lft.set(name, totalMs);
      lst.set(name, totalMs);
      return totalMs;
    }

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
  const epsilonMs = computeEpsilon(totalMs);
  const slack = new Map<string, number>();
  const criticalJobs = new Set<string>();

  for (const [name] of jobMap) {
    const s = (lst.get(name)! - est.get(name)!);
    slack.set(name, s / 1000); // convert to seconds for display
    if (Math.abs(s) < epsilonMs) {
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

  // Build consumer map, inferring stage deps for stage-ordered jobs
  const consumers = new Map<string, string[]>();
  for (const j of jobs) consumers.set(j.name, []);

  // Determine stage order from start times
  const stageStarts = new Map<string, number>();
  for (const j of jobs) {
    const start = startTimes.get(j.name) ?? 0;
    const cur = stageStarts.get(j.stage);
    if (cur === undefined || start < cur) stageStarts.set(j.stage, start);
  }
  const orderedStages = [...stageStarts.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([stage]) => stage);
  const stageIndex = new Map(orderedStages.map((s, i) => [s, i]));

  const jobsByStage = new Map<string, string[]>();
  for (const j of jobs) {
    if (!jobsByStage.has(j.stage)) jobsByStage.set(j.stage, []);
    jobsByStage.get(j.stage)!.push(j.name);
  }

  for (const j of jobs) {
    if (j.needs === null) {
      const myIdx = stageIndex.get(j.stage) ?? 0;
      for (const [stage, idx] of stageIndex) {
        if (idx < myIdx) {
          for (const depName of jobsByStage.get(stage) || []) {
            consumers.get(depName)!.push(j.name);
          }
        }
      }
    } else {
      for (const dep of j.needs) {
        if (consumers.has(dep)) {
          consumers.get(dep)!.push(j.name);
        }
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
