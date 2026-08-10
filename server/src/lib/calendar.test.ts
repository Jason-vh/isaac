import { describe, expect, test } from "bun:test";
import {
  addDays,
  amsterdamDayStart,
  isDateString,
  mondayOf,
  toAmsterdamDate,
} from "./calendar";

describe("amsterdamDayStart", () => {
  test("winter days start at 23:00 UTC the day before", () => {
    expect(amsterdamDayStart("2026-01-05").toISOString()).toBe(
      "2026-01-04T23:00:00.000Z"
    );
  });

  test("summer days start at 22:00 UTC the day before", () => {
    expect(amsterdamDayStart("2026-07-06").toISOString()).toBe(
      "2026-07-05T22:00:00.000Z"
    );
  });

  test("is correct on the day the clocks go forward", () => {
    // DST starts at 02:00 local on 2026-03-29, so midnight is still CET.
    expect(amsterdamDayStart("2026-03-29").toISOString()).toBe(
      "2026-03-28T23:00:00.000Z"
    );
  });

  test("is correct on the day the clocks go back", () => {
    // DST ends at 03:00 local on 2026-10-25, so midnight is still CEST.
    expect(amsterdamDayStart("2026-10-25").toISOString()).toBe(
      "2026-10-24T22:00:00.000Z"
    );
  });

  test("round-trips with toAmsterdamDate", () => {
    for (const date of ["2026-01-05", "2026-03-29", "2026-07-06", "2026-10-25"]) {
      expect(toAmsterdamDate(amsterdamDayStart(date))).toBe(date);
      // One millisecond earlier still belongs to the previous day.
      const before = new Date(amsterdamDayStart(date).getTime() - 1);
      expect(toAmsterdamDate(before)).toBe(addDays(date, -1));
    }
  });
});

describe("toAmsterdamDate", () => {
  test("puts late-evening UTC on the next Amsterdam day", () => {
    // 23:30 UTC on Sunday is already Monday in Amsterdam.
    expect(toAmsterdamDate(new Date("2026-01-04T23:30:00Z"))).toBe("2026-01-05");
  });
});

describe("mondayOf", () => {
  test("returns the same day for a Monday", () => {
    expect(mondayOf("2026-01-05")).toBe("2026-01-05");
  });

  test("walks back within the week", () => {
    expect(mondayOf("2026-01-09")).toBe("2026-01-05");
  });

  test("treats Sunday as the end of the week, not the start", () => {
    expect(mondayOf("2026-01-11")).toBe("2026-01-05");
  });
});

describe("addDays", () => {
  test("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("crosses a DST boundary without drifting", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
  });
});

describe("isDateString", () => {
  test("accepts a calendar date", () => {
    expect(isDateString("2026-01-05")).toBe(true);
  });

  test("rejects anything else", () => {
    for (const bad of ["", "not-a-date", "2026-1-5", "2026-13-01", "2026-01-05T00:00:00Z"]) {
      expect(isDateString(bad)).toBe(false);
    }
  });
});
