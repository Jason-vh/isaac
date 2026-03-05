import { Elysia } from "elysia";
import { isSyncRunning } from "../sync/util";
import { syncJira } from "../sync/jira";
import { syncGitLab } from "../sync/gitlab";
import { syncConfluence } from "../sync/confluence";
import { syncCalendar } from "../sync/calendar";
import { syncGitLabPipelines } from "../sync/gitlab-pipelines";
import { runLinker } from "../sync/linker";

const SYNC_FNS: Record<string, (since?: Date) => Promise<void>> = {
  jira: syncJira,
  gitlab: syncGitLab,
  confluence: syncConfluence,
  calendar: syncCalendar,
  "gitlab-pipelines": syncGitLabPipelines,
};

const VALID_SOURCES = Object.keys(SYNC_FNS);

export const syncRoutes = new Elysia({ prefix: "/api/sync" }).post(
  "/trigger",
  async ({ body }) => {
    const { sources, since } = (body ?? {}) as {
      sources?: string[];
      since?: string;
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

    // Guard against concurrent syncs
    if (await isSyncRunning()) {
      return { error: "Another sync is already running" };
    }

    // Run syncs sequentially
    const results: Record<string, string> = {};
    for (const source of toSync) {
      try {
        await SYNC_FNS[source](sinceDate);
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
