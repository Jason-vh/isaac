import { db } from "../db";
import { meetings } from "../db/schema";
import { env } from "../env";
import { apiFetch, runSyncWithLog } from "./util";

// ---------------------------------------------------------------------------
// Types for Calendar Apps Script response
// ---------------------------------------------------------------------------

interface CalendarEvent {
  eventId: string;
  title: string;
  startTime: string; // ISO 8601 with timezone
  endTime: string; // ISO 8601 with timezone
  responseStatus: string;
}

interface CalendarResponse {
  events?: CalendarEvent[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Calendar sync
// ---------------------------------------------------------------------------

export async function syncCalendar(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog("calendar", async (since) => {
    // Lazy env access
    const scriptUrl = env.CALENDAR_SCRIPT_URL;
    const secret = env.CALENDAR_SCRIPT_SECRET;

    const now = new Date();

    const { data } = await apiFetch<CalendarResponse>(scriptUrl, {
      method: "POST",
      body: JSON.stringify({
        secret,
        from: since.toISOString(),
        to: now.toISOString(),
      }),
    });

    if (data.error) {
      throw new Error(`Calendar API error: ${data.error}`);
    }

    const events = data.events ?? [];

    if (events.length === 0) return 0;

    // Upsert meetings — do NOT overwrite category, epicKey, epicKeyInferred
    // Google Calendar's getId() returns the same iCalUID for every instance
    // of a recurring event, so we derive a unique key per instance by
    // appending the start time to all instances of duplicate eventIds.
    const idCounts = new Map<string, number>();
    for (const event of events) {
      idCounts.set(event.eventId, (idCounts.get(event.eventId) ?? 0) + 1);
    }

    for (const event of events) {
      let key = event.eventId;
      if (idCounts.get(key)! > 1) {
        // Recurring instance — make unique by inserting start date before @google.com
        const startUtc = new Date(event.startTime)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d+Z$/, "Z");
        key = key.replace("@google.com", `_${startUtc}@google.com`);
      }

      await db
        .insert(meetings)
        .values({
          calendarEventId: key,
          title: event.title,
          responseStatus: event.responseStatus,
          startsAt: new Date(event.startTime),
          endsAt: new Date(event.endTime),
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: meetings.calendarEventId,
          set: {
            title: event.title,
            responseStatus: event.responseStatus,
            startsAt: new Date(event.startTime),
            endsAt: new Date(event.endTime),
            syncedAt: new Date(),
          },
        });
    }

    return events.length;
  }, sinceOverride);
}
