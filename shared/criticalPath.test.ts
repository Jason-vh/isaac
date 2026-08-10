import { describe, expect, test } from "bun:test";
import { computeCriticalPath, type CriticalPathJob } from "./criticalPath";

const START = Date.parse("2026-01-05T10:00:00Z");
const at = (offsetSeconds: number) =>
  new Date(START + offsetSeconds * 1000).toISOString();

function job(
  name: string,
  fromSeconds: number,
  toSeconds: number,
  overrides: Partial<CriticalPathJob> = {}
): CriticalPathJob {
  return {
    name,
    stage: "test",
    retried: false,
    startedAt: at(fromSeconds),
    finishedAt: at(toSeconds),
    queuedDurationSeconds: null,
    needs: [],
    ...overrides,
  };
}

const critical = (jobs: CriticalPathJob[], endSeconds: number) =>
  computeCriticalPath(jobs, START, START + endSeconds * 1000).criticalJobs;

describe("computeCriticalPath", () => {
  test("returns nothing for a zero-length pipeline", () => {
    expect(computeCriticalPath([job("a", 0, 10)], START, START).criticalJobs.size).toBe(0);
  });

  test("finds the longest of two parallel jobs", () => {
    const jobs = [job("slow", 0, 600), job("fast", 0, 60)];
    const result = critical(jobs, 600);

    expect(result.has("slow")).toBe(true);
    expect(result.has("fast")).toBe(false);
  });

  test("marks a whole dependency chain as critical", () => {
    const jobs = [
      job("build", 0, 300),
      job("test", 300, 600, { needs: ["build"] }),
      job("lint", 0, 30),
    ];
    const result = critical(jobs, 600);

    expect(result.has("build")).toBe(true);
    expect(result.has("test")).toBe(true);
    expect(result.has("lint")).toBe(false);
  });

  test("ignores retried attempts", () => {
    const jobs = [
      job("flaky", 0, 600, { retried: true }),
      job("flaky", 0, 60),
      job("steady", 0, 300),
    ];
    const result = critical(jobs, 300);

    expect(result.has("steady")).toBe(true);
  });

  test("skips jobs with no timestamps", () => {
    const jobs = [
      job("pending", 0, 0, { startedAt: null, finishedAt: null }),
      job("real", 0, 300),
    ];
    const result = critical(jobs, 300);

    expect(result.has("pending")).toBe(false);
    expect(result.has("real")).toBe(true);
  });

  test("counts queue time as part of a job, not as slack", () => {
    // Starts at 300s but waited 300s for a runner, so it really began at 0.
    const jobs = [
      job("queued", 300, 600, { queuedDurationSeconds: 300 }),
      job("other", 0, 60),
    ];
    const result = critical(jobs, 600);

    expect(result.has("queued")).toBe(true);
  });

  test("infers dependencies from stage order when needs is null", () => {
    const jobs = [
      job("build", 0, 300, { stage: "build", needs: null }),
      job("test", 300, 600, { stage: "test", needs: null }),
    ];
    const result = critical(jobs, 600);

    expect(result.has("build")).toBe(true);
    expect(result.has("test")).toBe(true);
  });

  test("terminates on a dependency cycle instead of overflowing the stack", () => {
    const jobs = [
      job("a", 0, 300, { needs: ["b"] }),
      job("b", 300, 600, { needs: ["a"] }),
    ];

    expect(() => critical(jobs, 600)).not.toThrow();
  });
});
