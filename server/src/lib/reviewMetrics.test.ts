import { describe, expect, test } from "bun:test";
import { distribution, median, workHoursBetween } from "./reviewMetrics";

const at = (iso: string) => new Date(iso);

describe("workHoursBetween", () => {
  test("counts plain hours within a weekday", () => {
    expect(workHoursBetween(at("2026-01-05T09:00:00Z"), at("2026-01-05T17:30:00Z"))).toBe(8.5);
  });

  test("returns 0 when the end is not after the start", () => {
    expect(workHoursBetween(at("2026-01-05T09:00:00Z"), at("2026-01-05T09:00:00Z"))).toBe(0);
    expect(workHoursBetween(at("2026-01-05T10:00:00Z"), at("2026-01-05T09:00:00Z"))).toBe(0);
  });

  test("skips the weekend", () => {
    // Friday 17:00 to Monday 09:00 is 16 working hours, not 64.
    expect(workHoursBetween(at("2026-01-09T17:00:00Z"), at("2026-01-12T09:00:00Z"))).toBe(16);
  });

  test("excludes a whole weekend spanned in the middle", () => {
    // Thursday to the next Tuesday, same time: 5 days minus 2 weekend days.
    expect(workHoursBetween(at("2026-01-08T12:00:00Z"), at("2026-01-13T12:00:00Z"))).toBe(72);
  });

  test("counts nothing for a wait entirely inside the weekend", () => {
    expect(workHoursBetween(at("2026-01-10T09:00:00Z"), at("2026-01-11T17:00:00Z"))).toBe(0);
  });

  test("handles multi-week gaps", () => {
    // Two full weeks: 10 working days.
    expect(workHoursBetween(at("2026-01-05T00:00:00Z"), at("2026-01-19T00:00:00Z"))).toBe(240);
  });
});

describe("distribution", () => {
  test("reports an empty distribution for no values", () => {
    expect(distribution([])).toEqual({ n: 0, p50: null, p90: null, p99: null });
    expect(distribution([null, null])).toEqual({ n: 0, p50: null, p90: null, p99: null });
  });

  test("ignores nulls when counting", () => {
    expect(distribution([1, null, 3]).n).toBe(2);
  });

  test("interpolates percentiles", () => {
    const d = distribution([1, 2, 3, 4]);
    expect(d.p50).toBe(2.5);
    expect(d.p90).toBe(3.7);
  });

  test("handles a single value", () => {
    expect(distribution([5])).toEqual({ n: 1, p50: 5, p90: 5, p99: 5 });
  });

  test("sorts numerically, not lexicographically", () => {
    expect(distribution([10, 9, 2]).p50).toBe(9);
  });
});

describe("median", () => {
  test("is the 50th percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});
