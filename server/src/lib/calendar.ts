// Calendar days, in the timezone the work actually happened in. Buckets are
// Amsterdam-local, so query windows have to be too: treating a week as UTC
// drops Monday's first hour and pulls Saturday's into Friday.

const AMSTERDAM = "Europe/Amsterdam";

/** A calendar day as YYYY-MM-DD. */
export type DateString = string;

export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** The Amsterdam-local calendar day an instant falls on. */
export function toAmsterdamDate(at: Date): DateString {
  return at.toLocaleDateString("sv-SE", { timeZone: AMSTERDAM });
}

/** Amsterdam's UTC offset, in minutes, at a given instant. */
function amsterdamOffsetMinutes(at: Date): number {
  // "sv-SE" renders as "YYYY-MM-DD HH:mm:ss", which parses back as UTC.
  const asUtc = new Date(
    `${at.toLocaleString("sv-SE", { timeZone: AMSTERDAM }).replace(" ", "T")}Z`
  );
  return (asUtc.getTime() - at.getTime()) / 60_000;
}

/**
 * The instant at which an Amsterdam-local day begins.
 *
 * One offset correction is enough: Amsterdam's DST changes happen at 02:00
 * local, so local midnight is never inside a skipped or repeated hour.
 */
export function amsterdamDayStart(date: DateString): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  return new Date(
    utcMidnight.getTime() - amsterdamOffsetMinutes(utcMidnight) * 60_000
  );
}

/** Adds whole days to a calendar date. */
export function addDays(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `date`. */
export function mondayOf(date: DateString): DateString {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** Today, as an Amsterdam-local calendar day. */
export function todayInAmsterdam(): DateString {
  return toAmsterdamDate(new Date());
}
