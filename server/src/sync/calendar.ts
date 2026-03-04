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
    for (const event of events) {
      await db
        .insert(meetings)
        .values({
          calendarEventId: event.eventId,
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
