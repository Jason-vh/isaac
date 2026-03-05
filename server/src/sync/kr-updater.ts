import { db } from "../db";
import { keyResults, pipelines } from "../db/schema";
import { eq, isNotNull, sql, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Data source handlers — each computes a current value for a KR
// ---------------------------------------------------------------------------

type DataSourceHandler = () => Promise<number | null>;

const handlers: Record<string, DataSourceHandler> = {
  "pipeline:max_duration": async () => {
    // Get max pipeline duration from the most recent week that has data
    const rows = await db.execute(sql`
      SELECT max(duration_seconds) AS max_dur
      FROM pipelines
      WHERE duration_seconds IS NOT NULL
        AND gitlab_created_at >= now() - interval '7 days'
    `);

    const row = rows.rows[0];
    if (!row || row.max_dur == null) {
      // Fall back to most recent 4 weeks if no data in last week
      const fallback = await db.execute(sql`
        SELECT max(duration_seconds) AS max_dur
        FROM pipelines
        WHERE duration_seconds IS NOT NULL
          AND gitlab_created_at >= now() - interval '28 days'
      `);
      const fb = fallback.rows[0];
      if (!fb || fb.max_dur == null) return null;
      return Math.round(Number(fb.max_dur) / 60); // seconds → minutes
    }

    return Math.round(Number(row.max_dur) / 60); // seconds → minutes
  },
};

// ---------------------------------------------------------------------------
// updateKeyResults — finds KRs with a dataSource and auto-updates them
// ---------------------------------------------------------------------------

export async function updateKeyResults(): Promise<void> {
  const krs = await db
    .select({ id: keyResults.id, dataSource: keyResults.dataSource })
    .from(keyResults)
    .where(isNotNull(keyResults.dataSource));

  for (const kr of krs) {
    const handler = handlers[kr.dataSource!];
    if (!handler) {
      console.warn(`[kr-updater] Unknown data source: ${kr.dataSource}`);
      continue;
    }

    const value = await handler();
    if (value == null) continue;

    await db
      .update(keyResults)
      .set({ currentValue: String(value) })
      .where(eq(keyResults.id, kr.id));

    console.log(
      `[kr-updater] Updated KR ${kr.id} (${kr.dataSource}): ${value}`
    );
  }
}
