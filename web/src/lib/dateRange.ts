/** Shared helpers for the `since`/`until` date range used across report pages. */

import type { Sprint } from "@isaac/shared";

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

/** A range of `days` ending today, inclusive — "7d" really covers 7 days. */
function lastDays(days: number): DateRange {
  return { since: daysAgo(days - 1), until: today() };
}

export const DATE_PRESETS: DateRangePreset[] = [
  { id: "today", label: "Today", title: "Today", range: () => ({ since: today(), until: today() }) },
  { id: "7d", label: "7d", title: "Last 7 days", range: () => lastDays(7) },
  { id: "30d", label: "30d", title: "Last 30 days", range: () => lastDays(30) },
  { id: "90d", label: "90d", title: "Last 90 days", range: () => lastDays(90) },
];

/** Looks up one of the fixed presets, for seeding a page's default range. */
export function presetRange(id: string): DateRange {
  const preset = DATE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown date preset: ${id}`);
  return preset.range();
}

/**
 * A sprint as an inclusive range. Jira's end date is the next sprint's start,
 * so the last day is one earlier; a running sprint stops at today.
 */
export function sprintRange(sprint: Sprint): DateRange {
  const since = toDateString(new Date(sprint.startDate!));
  const end = sprint.endDate
    ? addDays(toDateString(new Date(sprint.endDate)), -1)
    : today();
  const now = today();
  // A running sprint stops at today; one yet to start keeps its full span.
  return { since, until: since <= now && end > now ? now : end };
}

/** The sprint covering today, else the most recent one to have started. */
export function currentSprint(sprints: Sprint[]): Sprint | null {
  const started = sprints
    .filter((s) => s.startDate && s.startDate.slice(0, 10) <= today())
    .sort((a, b) => b.startDate!.localeCompare(a.startDate!));
  return started.find((s) => s.state === "active") ?? started[0] ?? null;
}

/** Presets for the picker; the sprint one appears once sprints have loaded. */
export function buildPresets(sprints: Sprint[]): DateRangePreset[] {
  const sprint = currentSprint(sprints);
  if (!sprint) return DATE_PRESETS;

  const preset: DateRangePreset = {
    id: "sprint",
    label: "Sprint",
    title: `${sprint.name} so far`,
    range: () => sprintRange(sprint),
  };
  return [DATE_PRESETS[0], preset, ...DATE_PRESETS.slice(1)];
}

/** The preset matching this range, if any, so hand-picked dates still light one up. */
export function matchPreset(range: DateRange, presets: DateRangePreset[]): string | null {
  const match = presets.find((p) => {
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
