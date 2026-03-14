import type { JobStats, CriticalPathSegment, CriticalPathDecomposition } from "@isaac/shared";

interface JobInput {
  name: string;
  p50Duration: number | null;
  avgDuration: number;
  needs: string[];
}

/**
 * Computes simulated end times for all jobs using the same forward-pass
 * algorithm as JobGanttChart's resolve(). For each job, endTime =
 * max(endTimes of all needs) + own duration. Jobs with no needs start at 0.
 */
export function computeEndTimes(jobs: JobInput[]): Map<string, number> {
  const jobMap = new Map(jobs.map((j) => [j.name, j]));
  const endTimes = new Map<string, number>();

  function resolve(name: string): number {
    if (endTimes.has(name)) return endTimes.get(name)!;
    const job = jobMap.get(name);
    if (!job) return 0;

    // Filter deps to known jobs only
    const deps = job.needs.filter((n) => jobMap.has(n));
    const start = deps.length > 0 ? Math.max(...deps.map(resolve)) : 0;
    const duration = job.p50Duration ?? job.avgDuration;

    const end = start + duration;
    endTimes.set(name, end);
    return end;
  }

  for (const j of jobs) resolve(j.name);
  return endTimes;
}

/**
 * Finds the critical path by walking backwards from the terminal node
 * (the job with the longest endTime). At each step, the predecessor is
 * the needs dependency with the highest endTime.
 */
export function findCriticalPath(
  endTimes: Map<string, number>,
  jobs: { name: string; needs: string[] }[]
): string[] {
  const jobMap = new Map(jobs.map((j) => [j.name, j]));

  // Find the terminal node with the longest end time
  let maxEnd = -1;
  let terminalJob = "";
  for (const [name, end] of endTimes) {
    if (end > maxEnd) {
      maxEnd = end;
      terminalJob = name;
    }
  }

  if (!terminalJob) return [];

  // Walk backwards from terminal node
  const path: string[] = [terminalJob];
  let current = terminalJob;

  while (true) {
    const job = jobMap.get(current);
    if (!job) break;

    // Filter deps to known jobs only
    const deps = job.needs.filter((n) => jobMap.has(n));
    if (deps.length === 0) break;

    // Pick the dependency with the highest end time
    let bestDep = deps[0];
    let bestEnd = endTimes.get(deps[0]) ?? 0;
    for (let i = 1; i < deps.length; i++) {
      const depEnd = endTimes.get(deps[i]) ?? 0;
      if (depEnd > bestEnd) {
        bestEnd = depEnd;
        bestDep = deps[i];
      }
    }

    path.unshift(bestDep);
    current = bestDep;
  }

  return path;
}

/**
 * Returns the decomposed critical path with per-job wall-clock contributions.
 *
 * For each job on the critical path:
 *   ownContribution = (endTime_current - endTime_prev) -
 *                     sum(ownContribution of predecessor deps on the critical path)
 *
 * New jobs (no previous data) are charged the full delta vs predecessor's
 * previous endTime.
 */
export function decomposeCriticalPath(
  currentJobs: JobStats[],
  prevJobs: JobStats[]
): CriticalPathDecomposition {
  const currentEndTimes = computeEndTimes(currentJobs);
  const prevEndTimes = computeEndTimes(prevJobs);

  const currentPath = findCriticalPath(currentEndTimes, currentJobs);
  const prevPath = findCriticalPath(prevEndTimes, prevJobs);

  const currentJobMap = new Map(currentJobs.map((j) => [j.name, j]));
  const prevJobSet = new Set(prevJobs.map((j) => j.name));

  // Detect topology changes
  const newJobs = currentPath.filter((name) => !prevJobSet.has(name));
  const droppedJobs = prevPath.filter((name) => !currentPath.includes(name));
  const pathChanged =
    newJobs.length > 0 ||
    droppedJobs.length > 0 ||
    currentPath.length !== prevPath.length ||
    currentPath.some((name, i) => name !== prevPath[i]);

  const currentMaxTime = Math.max(...[...currentEndTimes.values()], 0);
  const prevMaxTime = prevEndTimes.size > 0 ? Math.max(...[...prevEndTimes.values()], 0) : null;
  const totalDeltaSeconds = prevMaxTime !== null ? currentMaxTime - prevMaxTime : currentMaxTime;

  // Compute per-job contributions
  const segments: CriticalPathSegment[] = [];
  let cumulativeTotal = 0;

  for (let i = 0; i < currentPath.length; i++) {
    const jobName = currentPath[i];
    const job = currentJobMap.get(jobName)!;
    const currentEnd = currentEndTimes.get(jobName) ?? 0;
    const prevEnd = prevEndTimes.has(jobName) ? (prevEndTimes.get(jobName) ?? 0) : null;

    let ownContribution: number;

    if (prevEnd === null) {
      // New job — charge its full duration as contribution
      // The delta is: current end time minus what the predecessor ended at in the previous period
      if (i === 0) {
        // First job on the path with no previous data: full duration is the contribution
        ownContribution = job.p50Duration ?? job.avgDuration;
      } else {
        // The predecessor on the critical path
        const predPrevEnd = prevEndTimes.get(currentPath[i - 1]) ?? 0;
        // This job's contribution: how much the current end extends beyond
        // the predecessor's previous end, minus what predecessors already account for
        ownContribution = (currentEnd - predPrevEnd) - cumulativeTotal;
      }
    } else {
      // Existing job: own contribution is the change in end time minus
      // the sum of contributions of predecessors on the critical path
      ownContribution = (currentEnd - prevEnd) - cumulativeTotal;
    }

    cumulativeTotal += ownContribution;

    segments.push({
      jobName,
      stage: job.stage,
      currentEndTime: currentEnd,
      prevEndTime: prevEnd,
      ownContribution,
      cumulativeTotal,
    });
  }

  return {
    totalDeltaSeconds,
    currentMaxTime,
    prevMaxTime,
    segments,
    pathChanged,
    newJobs,
    droppedJobs,
  };
}
