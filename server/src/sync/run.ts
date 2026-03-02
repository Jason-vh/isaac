// Cron entry point — called by Railway on a schedule.
// Runs each source sync in sequence, with a concurrent-sync guard.

console.log(`[sync] Starting sync run at ${new Date().toISOString()}`);

// TODO: Import db and sync modules, implement:
// 1. Check sync_log for running jobs (concurrent-sync guard)
// 2. Run Jira → GitLab → Confluence → Calendar syncs
// 3. Run linker to infer relationships
// 4. Log results to sync_log

console.log("[sync] Sync run complete (no-op stub)");
