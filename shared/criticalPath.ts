// Critical-path analysis for a CI pipeline, shared by the API and the web app
// so both label the same jobs critical.

/** The job fields the analysis needs, from either a stored row or an API payload. */
export interface CriticalPathJob {
  name: string;
  stage: string;
  retried: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  queuedDurationSeconds: number | null;
  needs: string[] | null;
}

export interface CriticalPathResult {
  criticalJobs: Set<string>;
  /** Seconds of slack per job name. */
  slack: Map<string, number>;
}

/**
 * Proportional epsilon: 1% of pipeline duration (min 1s) to absorb runner
 * queue time and GitLab scheduling latency between dependent jobs.
 */
function computeEpsilon(totalMs: number): number {
  return Math.max(1000, totalMs * 0.01);
}

/**
 * Who depends on each job.
 *
 * GitLab only records `needs` for jobs in a DAG pipeline; when it's null the
 * job is ordered by stage instead, so it implicitly depends on every job in
 * every earlier stage.
 */
export function buildConsumers(
  jobs: { name: string; stage: string; needs: string[] | null }[],
  startOf: (name: string) => number
): Map<string, string[]> {
  const consumers = new Map<string, string[]>();
  for (const job of jobs) consumers.set(job.name, []);

  const stageStarts = new Map<string, number>();
  for (const job of jobs) {
    const start = startOf(job.name);
    const current = stageStarts.get(job.stage);
    if (current === undefined || start < current) stageStarts.set(job.stage, start);
  }

  const stageIndex = new Map(
    [...stageStarts.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([stage], i) => [stage, i] as const)
  );

  const jobsByStage = new Map<string, string[]>();
  for (const job of jobs) {
    const names = jobsByStage.get(job.stage) ?? [];
    names.push(job.name);
    jobsByStage.set(job.stage, names);
  }

  for (const job of jobs) {
    if (job.needs === null) {
      const myIndex = stageIndex.get(job.stage) ?? 0;
      for (const [stage, index] of stageIndex) {
        if (index >= myIndex) continue;
        for (const dependency of jobsByStage.get(stage) ?? []) {
          consumers.get(dependency)!.push(job.name);
        }
      }
    } else {
      for (const dependency of job.needs) {
        consumers.get(dependency)?.push(job.name);
      }
    }
  }

  return consumers;
}

/**
 * Latest start time for each job: how late it could begin without delaying the
 * pipeline. Resolved lazily in reverse topological order.
 */
export function latestStartTimes(
  names: Iterable<string>,
  consumers: Map<string, string[]>,
  durationOf: (name: string) => number | null,
  pipelineEnd: number
): Map<string, number> {
  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  // `needs` comes from GitLab, so a cycle would recurse forever if unguarded.
  const resolving = new Set<string>();

  function resolveFinish(name: string): number {
    const cached = latestFinish.get(name);
    if (cached !== undefined) return cached;

    const duration = durationOf(name);
    // Unknown job (skipped or manual) or a cycle: treat as unconstrained.
    if (duration === null || resolving.has(name)) {
      latestFinish.set(name, pipelineEnd);
      latestStart.set(name, pipelineEnd);
      return pipelineEnd;
    }

    resolving.add(name);
    const dependents = consumers.get(name) ?? [];
    const finish = dependents.length
      ? Math.min(...dependents.map(resolveStart))
      : pipelineEnd;
    resolving.delete(name);

    latestFinish.set(name, finish);
    latestStart.set(name, finish - duration);
    return finish;
  }

  function resolveStart(name: string): number {
    const cached = latestStart.get(name);
    if (cached !== undefined) return cached;
    resolveFinish(name);
    return latestStart.get(name)!;
  }

  for (const name of names) resolveFinish(name);
  return latestStart;
}

/**
 * The critical path through a pipeline's real job timestamps.
 *
 * Forward pass: earliest start and finish, relative to the pipeline start.
 * Backward pass: latest start each job could have had without delaying it.
 * A job is critical when the difference — its slack — is under the epsilon.
 */
export function computeCriticalPath(
  jobs: CriticalPathJob[],
  pipelineStart: number,
  pipelineEnd: number
): CriticalPathResult {
  const empty = { criticalJobs: new Set<string>(), slack: new Map<string, number>() };
  const totalMs = pipelineEnd - pipelineStart;
  if (totalMs <= 0) return empty;

  const completed = new Map<string, CriticalPathJob>();
  for (const job of jobs) {
    if (job.retried || !job.startedAt || !job.finishedAt) continue;
    completed.set(job.name, job);
  }

  // Queue-adjusted, and the earliest across all attempts, so that waiting for a
  // runner counts against the job rather than showing up as slack on the one
  // before it.
  const earliestStart = new Map<string, number>();
  for (const job of jobs) {
    if (!job.startedAt) continue;
    let start = new Date(job.startedAt).getTime();
    if (job.queuedDurationSeconds && job.queuedDurationSeconds > 0) {
      start -= job.queuedDurationSeconds * 1000;
    }
    const current = earliestStart.get(job.name);
    if (current === undefined || start < current) earliestStart.set(job.name, start);
  }

  const est = new Map<string, number>();
  const eft = new Map<string, number>();
  for (const [name, job] of completed) {
    const start = earliestStart.get(name) ?? new Date(job.startedAt!).getTime();
    est.set(name, start - pipelineStart);
    eft.set(name, new Date(job.finishedAt!).getTime() - pipelineStart);
  }

  const consumers = buildConsumers([...completed.values()], (name) => est.get(name) ?? 0);
  const latestStart = latestStartTimes(
    completed.keys(),
    consumers,
    (name) => (est.has(name) ? eft.get(name)! - est.get(name)! : null),
    totalMs
  );

  const epsilonMs = computeEpsilon(totalMs);
  const criticalJobs = new Set<string>();
  const slack = new Map<string, number>();

  for (const name of completed.keys()) {
    const slackMs = latestStart.get(name)! - est.get(name)!;
    slack.set(name, slackMs / 1000);
    if (Math.abs(slackMs) < epsilonMs) criticalJobs.add(name);
  }

  return { criticalJobs, slack };
}
