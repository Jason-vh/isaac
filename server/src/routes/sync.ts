import { Elysia } from "elysia";
import { desc, eq, and, lt } from "drizzle-orm";
import { db } from "../db";
import { syncLog } from "../db/schema";
import { isSyncRunning } from "../sync/util";
import { syncJira } from "../sync/jira";
import { syncGitLab } from "../sync/gitlab";
import { syncConfluence } from "../sync/confluence";
import { syncCalendar } from "../sync/calendar";
import { syncGitLabPipelines } from "../sync/gitlab-pipelines";
import { runLinker } from "../sync/linker";

const SYNC_FNS: Record<string, (since?: Date, opts?: { force?: boolean }) => Promise<void>> = {
  jira: syncJira,
  gitlab: syncGitLab,
  confluence: syncConfluence,
  calendar: syncCalendar,
  "gitlab-pipelines": syncGitLabPipelines,
};

const VALID_SOURCES = Object.keys(SYNC_FNS);

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .get("/log", async () => {
    const entries = await db
      .select()
      .from(syncLog)
      .orderBy(desc(syncLog.startedAt))
      .limit(50);
    return entries;
  })
  .post("/cleanup", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const cleaned = await db
      .update(syncLog)
      .set({ status: "error", finishedAt: new Date(), error: "Stale — cleaned up" })
      .where(and(eq(syncLog.status, "running"), lt(syncLog.startedAt, tenMinAgo)))
      .returning({ id: syncLog.id, source: syncLog.source });
    return { cleaned: cleaned.length, sources: cleaned.map((r) => r.source) };
  })
  .post(
  "/trigger",
  async ({ body }) => {
    const { sources, since, force } = (body ?? {}) as {
      sources?: string[];
      since?: string;
      force?: boolean;
    };

    // Validate sources
    const toSync = sources?.length
      ? sources.filter((s) => VALID_SOURCES.includes(s))
      : VALID_SOURCES;

    if (toSync.length === 0) {
      return { error: `Invalid sources. Valid: ${VALID_SOURCES.join(", ")}` };
    }

    // Parse since override
    let sinceDate: Date | undefined;
    if (since) {
      sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return { error: "Invalid since date" };
      }
    }

    // Guard against concurrent syncs (per-source)
    const running = await isSyncRunning(toSync);
    if (running.length > 0) {
      return { error: `Already running: ${running.join(", ")}` };
    }

    // Run syncs sequentially
    const results: Record<string, string> = {};
    for (const source of toSync) {
      try {
        await SYNC_FNS[source](sinceDate, { force: !!force });
        results[source] = "ok";
      } catch (err: any) {
        results[source] = `error: ${err.message}`;
      }
    }

    // Run linker
    try {
      await runLinker();
      results.linker = "ok";
    } catch (err: any) {
      results.linker = `error: ${err.message}`;
    }

    return { results, since: sinceDate?.toISOString() ?? "auto" };
  }
);
