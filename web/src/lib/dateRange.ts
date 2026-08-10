/** Shared helpers for the `since`/`until` date range used across report pages. */

export interface DateRange {
  since: string;
  until: string;
}

export interface DateRangePreset {
  id: string;
  label: string;
  title: string;
  range: () => DateRange;
}

/** Sprints run for two weeks from this Monday onwards. */
const SPRINT_ANCHOR = "2024-01-01";
const SPRINT_LENGTH_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local-date `YYYY-MM-DD`; `toISOString` would shift the day outside UTC. */
export function toDateString(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight for a `YYYY-MM-DD` string. */
export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Days since the epoch, counted in UTC so DST shifts cannot skew the arithmetic. */
function dayIndex(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function today(): string {
  return toDateString(new Date());
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function daysAgo(days: number): string {
  return addDays(today(), -days);
}

/** Number of days covered, counting both endpoints. */
export function dayCount(range: DateRange): number {
  return dayIndex(range.until) - dayIndex(range.since) + 1;
}

export function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Start of the sprint containing `date`. */
export function sprintStart(date = today()): string {
  const elapsed = dayIndex(date) - dayIndex(SPRINT_ANCHOR);
  const offset = ((elapsed % SPRINT_LENGTH_DAYS) + SPRINT_LENGTH_DAYS) % SPRINT_LENGTH_DAYS;
  return addDays(date, -offset);
}

/** A range of `days` ending today, inclusive — "7d" really covers 7 days. */
function lastDays(days: number): DateRange {
  return { since: daysAgo(days - 1), until: today() };
}

export const DATE_PRESETS: DateRangePreset[] = [
  { id: "today", label: "Today", title: "Today", range: () => ({ since: today(), until: today() }) },
  { id: "sprint", label: "Sprint", title: "This sprint so far", range: () => ({ since: sprintStart(), until: today() }) },
  { id: "7d", label: "7d", title: "Last 7 days", range: () => lastDays(7) },
  { id: "30d", label: "30d", title: "Last 30 days", range: () => lastDays(30) },
  { id: "90d", label: "90d", title: "Last 90 days", range: () => lastDays(90) },
];

export function presetRange(id: string): DateRange {
  const preset = DATE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown date preset: ${id}`);
  return preset.range();
}

/** The preset matching this range, if any, so hand-picked dates still light one up. */
export function matchPreset(range: DateRange): string | null {
  const match = DATE_PRESETS.find((p) => {
    const r = p.range();
    return r.since === range.since && r.until === range.until;
  });
  return match?.id ?? null;
}

/** Format a range compactly, dropping the year when it is the current one. */
export function formatRange(range: DateRange): string {
  const thisYear = new Date().getFullYear();
  const format = (date: string) =>
    parseDate(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: parseDate(date).getFullYear() === thisYear ? undefined : "numeric",
    });
  return range.since === range.until
    ? format(range.since)
    : `${format(range.since)} – ${format(range.until)}`;
}
