// The numeric core of the WBSO estimate, kept free of the database so the
// arithmetic can be tested directly.

export const HOURS_PER_DAY = 8;

/** Nothing smaller than a quarter hour is worth claiming, or survives rounding. */
export const MIN_ENTRY_HOURS = 0.25;

/**
 * Rounds hours to quarter-hour increments while preserving a target total,
 * using the largest-remainder (Hamilton) method.
 */
export function roundToQuartersPreservingTotal(
  entries: { hours: number }[],
  target: number
): void {
  if (entries.length === 0) return;

  const targetQuarters = Math.round(target * 4);
  const quarters = entries.map((e) => Math.floor(e.hours * 4));
  const remainders = entries.map((e, i) => e.hours * 4 - quarters[i]);

  // Largest remainder first; ties keep the original order.
  const byRemainder = entries
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a]);

  // A deficit can exceed one quarter per entry, so keep sweeping until it's
  // spent — a single pass would silently lose the remainder.
  let deficit = targetQuarters - quarters.reduce((a, b) => a + b, 0);
  while (deficit > 0) {
    for (const i of byRemainder) {
      if (deficit <= 0) break;
      quarters[i]++;
      deficit--;
    }
  }
  while (deficit < 0) {
    for (const i of [...byRemainder].reverse()) {
      if (deficit >= 0) break;
      if (quarters[i] === 0) continue;
      quarters[i]--;
      deficit++;
    }
    // Every entry is already at zero; the target can't be reached.
    if (quarters.every((q) => q === 0)) break;
  }

  for (let i = 0; i < entries.length; i++) {
    entries[i].hours = quarters[i] / 4;
  }
}

export interface DayAllocation {
  /** Hours per meeting, in the order given. */
  meetings: number[];
  /** Hours per weighted activity, in the order given. */
  activity: number[];
  /** No activity evidence at all — the day is left for manual entry. */
  needsInput: boolean;
}

/**
 * Fills a day to exactly 8h. Meetings keep their real duration; whatever is
 * left is split across activity by relative weight.
 *
 * The weights measure relative *size*, never duration, so the 8h total is a cap
 * rather than a target: a ten-hour day is compressed to a claimed eight.
 */
export function allocateDay(
  meetingHours: number[],
  weights: number[]
): DayAllocation {
  const meetings = meetingHours.map((hours) => ({ hours }));
  const bookedHours = meetingHours.reduce((sum, h) => sum + h, 0);

  // Meetings alone fill or overflow the day — scale them to fit.
  if (bookedHours >= HOURS_PER_DAY) {
    for (const m of meetings) m.hours *= HOURS_PER_DAY / bookedHours;
    roundToQuartersPreservingTotal(meetings, HOURS_PER_DAY);
    return { meetings: meetings.map((m) => m.hours), activity: [], needsInput: false };
  }

  // No evidence of activity. These hours go to a tax authority, so a plausible
  // guess is worse than a blank: surface the day empty instead of inventing it.
  if (weights.length === 0) {
    roundToQuartersPreservingTotal(meetings, bookedHours);
    return { meetings: meetings.map((m) => m.hours), activity: [], needsInput: true };
  }

  const available = HOURS_PER_DAY - bookedHours;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const activity = weights.map((weight) => ({
    hours:
      totalWeight > 0
        ? (weight / totalWeight) * available
        : available / weights.length,
  }));

  if (MIN_ENTRY_HOURS * activity.length >= available) {
    // Too many small entries to give each a minimum — share the time evenly.
    for (const e of activity) e.hours = available / activity.length;
  } else {
    // Raise anything below the minimum, and take it back from the entries that
    // are above it, in proportion to their size.
    let deficit = 0;
    let aboveMinTotal = 0;
    for (const e of activity) {
      if (e.hours < MIN_ENTRY_HOURS) {
        deficit += MIN_ENTRY_HOURS - e.hours;
        e.hours = MIN_ENTRY_HOURS;
      } else {
        aboveMinTotal += e.hours;
      }
    }
    if (deficit > 0 && aboveMinTotal > 0) {
      const scale = (aboveMinTotal - deficit) / aboveMinTotal;
      for (const e of activity) {
        if (e.hours > MIN_ENTRY_HOURS) e.hours *= scale;
      }
    }
  }

  const all = [...meetings, ...activity];
  roundToQuartersPreservingTotal(all, HOURS_PER_DAY);

  return {
    meetings: meetings.map((m) => m.hours),
    activity: activity.map((a) => a.hours),
    needsInput: false,
  };
}
