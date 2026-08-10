import { describe, expect, test } from "bun:test";
import {
  allocateDay,
  HOURS_PER_DAY,
  MIN_ENTRY_HOURS,
  roundToQuartersPreservingTotal,
} from "./allocate";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const isQuarter = (value: number) => Number.isInteger(value * 4);

describe("roundToQuartersPreservingTotal", () => {
  test("rounds to quarters and preserves the total", () => {
    const entries = [{ hours: 1.1 }, { hours: 2.3 }, { hours: 4.6 }];
    roundToQuartersPreservingTotal(entries, 8);

    expect(entries.every((e) => isQuarter(e.hours))).toBe(true);
    expect(sum(entries.map((e) => e.hours))).toBe(8);
  });

  test("distributes a deficit larger than one quarter per entry", () => {
    // Floors sum to 0 quarters against a target of 8 — a single pass over the
    // entries would leave 6 quarters unassigned.
    const entries = [{ hours: 0.1 }, { hours: 0.1 }];
    roundToQuartersPreservingTotal(entries, 2);

    expect(sum(entries.map((e) => e.hours))).toBe(2);
    expect(entries.every((e) => isQuarter(e.hours))).toBe(true);
  });

  test("gives the surplus to the largest remainder first", () => {
    const entries = [{ hours: 1.0 }, { hours: 1.2 }];
    roundToQuartersPreservingTotal(entries, 2.25);

    expect(entries[1].hours).toBeGreaterThan(entries[0].hours);
    expect(sum(entries.map((e) => e.hours))).toBe(2.25);
  });

  test("handles an empty list", () => {
    expect(() => roundToQuartersPreservingTotal([], 8)).not.toThrow();
  });
});

describe("allocateDay", () => {
  test("fills a day with meetings and activity to exactly 8h", () => {
    const { meetings, activity, needsInput } = allocateDay([1.5], [100, 20]);

    expect(needsInput).toBe(false);
    expect(sum([...meetings, ...activity])).toBe(HOURS_PER_DAY);
    expect([...meetings, ...activity].every(isQuarter)).toBe(true);
  });

  test("splits the remainder in proportion to weight", () => {
    const { activity } = allocateDay([], [300, 100]);

    expect(activity[0]).toBeGreaterThan(activity[1] * 2);
    expect(sum(activity)).toBe(HOURS_PER_DAY);
  });

  test("flags a day with no activity rather than inventing hours", () => {
    const { meetings, activity, needsInput } = allocateDay([2], []);

    expect(needsInput).toBe(true);
    expect(activity).toEqual([]);
    // Meetings stand on their own duration; the day is not filled to 8h.
    expect(sum(meetings)).toBe(2);
  });

  test("flags a wholly empty day", () => {
    expect(allocateDay([], [])).toEqual({
      meetings: [],
      activity: [],
      needsInput: true,
    });
  });

  test("scales overlong meeting days back to 8h and drops activity", () => {
    const { meetings, activity } = allocateDay([6, 5], [100]);

    expect(sum(meetings)).toBe(HOURS_PER_DAY);
    expect(meetings[0]).toBeGreaterThan(meetings[1]);
    // No room is left, so weighted activity produces no entries.
    expect(activity).toEqual([]);
  });

  test("gives every entry at least the minimum", () => {
    const { activity } = allocateDay([], [1000, 1, 1, 1]);

    expect(Math.min(...activity)).toBeGreaterThanOrEqual(MIN_ENTRY_HOURS);
    expect(sum(activity)).toBe(HOURS_PER_DAY);
  });

  test("shares evenly when the minimum can't be met for everyone", () => {
    // 40 entries at 15 minutes each would need 10h, more than the day has, so
    // the time is shared evenly and rounding spreads it a quarter at a time.
    const weights = Array.from({ length: 40 }, (_, i) => i + 1);
    const { activity } = allocateDay([], weights);

    expect(sum(activity)).toBe(HOURS_PER_DAY);
    expect(Math.max(...activity) - Math.min(...activity)).toBe(0.25);
  });

  test("falls back to an even split when all weights are zero", () => {
    const { activity } = allocateDay([], [0, 0]);

    expect(activity).toEqual([4, 4]);
  });

  test("preserves relative size rather than clamping to a floor", () => {
    // The bug this guards: flooring every weight collapsed the proportional
    // split, so a 10x bigger MR got the same hours as a tiny one.
    const { activity: even } = allocateDay([], [10, 10]);
    const { activity: skewed } = allocateDay([], [100, 10]);

    expect(even[0]).toBe(even[1]);
    expect(skewed[0]).toBeGreaterThan(skewed[1]);
  });
});
