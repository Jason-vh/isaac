import { describe, expect, test } from "bun:test";
import { BadRequest, parseLimit, parseOptionalDate, parseRange } from "./request";

describe("parseRange", () => {
  test("uses the given bounds", () => {
    const { since, until } = parseRange({
      since: "2026-01-01T00:00:00Z",
      until: "2026-01-31T00:00:00Z",
    });
    expect(since.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(until.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  test("defaults to the last 30 days", () => {
    const { since, until } = parseRange({});
    const days = (until.getTime() - since.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 5);
  });

  test("rejects an unparseable date rather than producing Invalid Date", () => {
    expect(() => parseRange({ since: "not-a-date" })).toThrow(BadRequest);
    expect(() => parseRange({ until: "2026-13-45" })).toThrow(BadRequest);
  });

  test("rejects an inverted range", () => {
    expect(() =>
      parseRange({ since: "2026-02-01T00:00:00Z", until: "2026-01-01T00:00:00Z" })
    ).toThrow(BadRequest);
  });
});

describe("parseOptionalDate", () => {
  test("passes undefined through", () => {
    expect(parseOptionalDate(undefined, "since")).toBeUndefined();
  });

  test("rejects a bad value", () => {
    expect(() => parseOptionalDate("nope", "since")).toThrow(BadRequest);
  });
});

describe("parseLimit", () => {
  test("falls back when absent", () => {
    expect(parseLimit(undefined, 50, 200)).toBe(50);
  });

  test("clamps to the maximum", () => {
    expect(parseLimit("9999", 50, 200)).toBe(200);
  });

  test("rejects zero, negatives and non-integers", () => {
    // A negative limit used to reach the SQL LIMIT clause.
    for (const bad of ["0", "-5", "abc", "1.5", ""]) {
      expect(() => parseLimit(bad, 50, 200)).toThrow(BadRequest);
    }
  });
});
