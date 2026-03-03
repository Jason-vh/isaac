// Cron entry point — called by Railway on a schedule.
// Runs each source sync in sequence, with a concurrent-sync guard.

import { validateSyncEnv } from "../env";
import { isSyncRunning } from "./util";
import { syncJira } from "./jira";
import { syncGitLab } from "./gitlab";
import { syncConfluence } from "./confluence";
import { syncCalendar } from "./calendar";
import { runLinker } from "./linker";

async function main() {
  console.log(`[sync] Starting sync run at ${new Date().toISOString()}`);

  // Step 1: Validate sync env vars
  validateSyncEnv();

  // Step 2: Concurrent-sync guard
  if (await isSyncRunning()) {
    console.log("[sync] Another sync is already running, exiting.");
    process.exit(0);
  }

  // Step 3: Run syncs sequentially — failure doesn't abort subsequent syncs
  const syncs = [
    { name: "Jira", fn: syncJira },
    { name: "GitLab", fn: syncGitLab },
    { name: "Confluence", fn: syncConfluence },
    { name: "Calendar", fn: syncCalendar },
  ];

  for (const { name, fn } of syncs) {
    try {
      await fn();
    } catch (err) {
      console.error(`[sync] ${name} sync failed:`, err);
      // Continue with next sync
    }
  }

  // Step 4: Run linker
  try {
    await runLinker();
  } catch (err) {
    console.error("[sync] Linker failed:", err);
  }

  console.log(`[sync] Sync run complete at ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
