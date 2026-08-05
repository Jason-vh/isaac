import type { Distribution } from "@isaac/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hours between two moments, skipping weekends. An MR that waits from Friday
 * evening to Monday morning waited a couple of hours, not three days.
 * Day boundaries are UTC, which is close enough for a CET-based team.
 */
export function workHoursBetween(from: Date, to: Date): number {
  const start = from.getTime();
  const end = to.getTime();
  if (end <= start) return 0;

  let weekendMs = 0;
  const firstDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  );
  for (let day = firstDay; day < end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) continue;
    weekendMs += Math.max(
      0,
      Math.min(day + DAY_MS, end) - Math.max(day, start)
    );
  }

  return round((end - start - weekendMs) / (60 * 60 * 1000));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower));
}

export function distribution(values: Array<number | null>): Distribution {
  const sorted = values
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, p50: null, p90: null, p99: null };
  return {
    n: sorted.length,
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
  };
}

export function median(values: Array<number | null>): number | null {
  return distribution(values).p50;
}
