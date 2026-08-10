// Cron entry point — called by Railway on a schedule.
// Runs each source sync in sequence, with a concurrent-sync guard.

import { validateSyncEnv } from "../env";
import { isSyncRunning } from "./util";
import { syncJira } from "./jira";
import { syncJiraSprints } from "./jira-sprints";
import { syncGitLab } from "./gitlab";
import { syncConfluence } from "./confluence";
import { syncCalendar } from "./calendar";
import { syncGitLabPipelines } from "./gitlab-pipelines";
import { runLinker } from "./linker";

async function main() {
  console.log(`[sync] Starting sync run at ${new Date().toISOString()}`);

  // Step 1: Validate sync env vars
  validateSyncEnv();

  // Step 2: Concurrent-sync guard
  if ((await isSyncRunning()).length > 0) {
    console.log("[sync] Another sync is already running, exiting.");
    process.exit(0);
  }

  // Step 3: Run syncs sequentially — failure doesn't abort subsequent syncs
  const syncs = [
    { name: "Jira", fn: syncJira },
    { name: "Jira Sprints", fn: syncJiraSprints },
    { name: "GitLab", fn: syncGitLab },
    { name: "Confluence", fn: syncConfluence },
    { name: "Calendar", fn: syncCalendar },
    { name: "GitLab Pipelines", fn: syncGitLabPipelines },
  ];

  const failed: string[] = [];

  for (const { name, fn } of syncs) {
    try {
      await fn();
    } catch (err) {
      console.error(`[sync] ${name} sync failed:`, err);
      failed.push(name);
      // Continue with next sync
    }
  }

  // Step 4: Run linker
  try {
    await runLinker();
  } catch (err) {
    console.error("[sync] Linker failed:", err);
    failed.push("Linker");
  }

  console.log(`[sync] Sync run complete at ${new Date().toISOString()}`);

  // Exit non-zero so the cron run is reported as failed rather than green.
  if (failed.length > 0) {
    console.error(`[sync] Failed sources: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
