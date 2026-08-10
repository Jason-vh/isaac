// Query-parameter parsing. Unvalidated input used to reach Date arithmetic and
// surface as a 500; these turn it into a 400 instead.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

/** Thrown for malformed input; mapped to a 400 by the server's error handler. */
export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequest";
  }
}

function parseDate(value: string, param: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequest(`Invalid ${param}, expected an ISO timestamp`);
  }
  return date;
}

export interface DateRange {
  since: Date;
  until: Date;
}

/** A `since`/`until` window, defaulting to the last 30 days. */
export function parseRange(
  query: Record<string, string | undefined>,
  defaultDays = DEFAULT_RANGE_DAYS
): DateRange {
  const until = query.until ? parseDate(query.until, "until") : new Date();
  const since = query.since
    ? parseDate(query.since, "since")
    : new Date(until.getTime() - defaultDays * DAY_MS);

  if (since > until) throw new BadRequest("since must not be after until");
  return { since, until };
}

/** An optional `since`/`until` bound, for endpoints where either may be absent. */
export function parseOptionalDate(
  value: string | undefined,
  param: string
): Date | undefined {
  return value ? parseDate(value, param) : undefined;
}

/** A positive integer query param, clamped to `max`. */
export function parseLimit(
  value: string | undefined,
  fallback: number,
  max: number
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequest(`Invalid limit, expected a positive integer`);
  }
  return Math.min(parsed, max);
}
