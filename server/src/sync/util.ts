import { db } from "../db";
import { syncLog } from "../db/schema";
import { eq, and, desc, gt, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// apiFetch — thin fetch wrapper with retries on 429/5xx
// ---------------------------------------------------------------------------

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<{ data: T; headers: Headers }> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { ...options, headers });

    if (res.ok) {
      const data = (await res.json()) as T;
      return { data, headers: res.headers };
    }

    const shouldRetry =
      (res.status === 429 || res.status >= 500) && attempt < retries;
    if (shouldRetry) {
      const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s
      console.warn(
        `[apiFetch] ${res.status} from ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const body = await res.text();
    throw new Error(
      `apiFetch ${res.status} ${url}: ${body.slice(0, 200)}`
    );
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("apiFetch: exhausted retries");
}

// ---------------------------------------------------------------------------
// basicAuthHeader
// ---------------------------------------------------------------------------

export function basicAuthHeader(email: string, token: string): string {
  return "Basic " + btoa(email + ":" + token);
}

// ---------------------------------------------------------------------------
// Sync log helpers
// ---------------------------------------------------------------------------

export async function getSyncSince(source: string): Promise<Date> {
  const [last] = await db
    .select({ startedAt: syncLog.startedAt })
    .from(syncLog)
    .where(and(eq(syncLog.source, source), eq(syncLog.status, "success")))
    .orderBy(desc(syncLog.startedAt))
    .limit(1);

  if (last) {
    // Overlap by 1 hour to avoid missing records
    return new Date(last.startedAt.getTime() - 60 * 60 * 1000);
  }

  // First run: 30 days ago
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export async function createSyncLogEntry(source: string): Promise<number> {
  const [row] = await db
    .insert(syncLog)
    .values({
      source,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: syncLog.id });
  return row.id;
}

export async function completeSyncLogEntry(
  id: number,
  itemsSynced: number
): Promise<void> {
  await db
    .update(syncLog)
    .set({
      status: "success",
      finishedAt: new Date(),
      itemsSynced,
    })
    .where(eq(syncLog.id, id));
}

export async function failSyncLogEntry(
  id: number,
  error: unknown
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error);
  await db
    .update(syncLog)
    .set({
      status: "error",
      finishedAt: new Date(),
      error: message.slice(0, 2000),
    })
    .where(eq(syncLog.id, id));
}

// ---------------------------------------------------------------------------
// runSyncWithLog — orchestrates getSyncSince + log entry lifecycle
// ---------------------------------------------------------------------------

export async function runSyncWithLog(
  source: string,
  fn: (since: Date) => Promise<number>,
  sinceOverride?: Date
): Promise<void> {
  const since = sinceOverride ?? (await getSyncSince(source));
  const logId = await createSyncLogEntry(source);
  try {
    const count = await fn(since);
    await completeSyncLogEntry(logId, count);
    console.log(
      `[sync:${source}] Synced ${count} items (since ${since.toISOString()})`
    );
  } catch (err) {
    await failSyncLogEntry(logId, err);
    console.error(`[sync:${source}] Failed:`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// dedup — generic event dedup helper
// ---------------------------------------------------------------------------

export function dedup<E, I>(
  existing: E[],
  incoming: I[],
  existingKeyFn: (item: E) => string,
  incomingKeyFn: (item: I) => string
): I[] {
  const existingKeys = new Set(existing.map(existingKeyFn));
  return incoming.filter((item) => !existingKeys.has(incomingKeyFn(item)));
}

// ---------------------------------------------------------------------------
// paginateGitLab — follows x-next-page headers
// ---------------------------------------------------------------------------

export async function paginateGitLab<T>(
  url: string,
  headers: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const separator = url.includes("?") ? "&" : "?";
    const pagedUrl = `${url}${separator}per_page=100&page=${page}`;

    const { data, headers: resHeaders } = await apiFetch<T[]>(pagedUrl, {
      headers,
    });

    all.push(...data);

    const nextPage = resHeaders.get("x-next-page");
    if (!nextPage || nextPage === "") break;
    page = Number(nextPage);
  }

  return all;
}

// ---------------------------------------------------------------------------
// isSyncRunning — concurrent-sync guard
// ---------------------------------------------------------------------------

export async function isSyncRunning(sources?: string[]): Promise<string[]> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const rows = await db
    .select({ source: syncLog.source })
    .from(syncLog)
    .where(
      and(
        eq(syncLog.status, "running"),
        gt(syncLog.startedAt, tenMinAgo),
        ...(sources?.length ? [inArray(syncLog.source, sources)] : [])
      )
    );
  return rows.map((r) => r.source);
}
