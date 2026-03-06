import { db } from "../db";
import {
  meetings,
  mergeRequests,
  mergeRequestEvents,
  commits,
  tickets,
} from "../db/schema";
import { and, eq, gte, lt, inArray, isNull } from "drizzle-orm";
import type {
  WbsoEntry,
  WbsoDayData,
  WbsoCategoryTotals,
  WbsoEpicSummary,
  WbsoUnlinkedMR,
  WbsoWeekData,
  WbsoCategory,
} from "@isaac/shared";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Convert a timestamp to Amsterdam-local date string (YYYY-MM-DD)
function toAmsterdamDate(ts: Date): string {
  return ts.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

function clamp(min: number, val: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export async function estimateWeek(monday: Date): Promise<WbsoWeekData> {
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  // Build date strings for Mon-Fri
  const dayDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dayDates.push(formatDate(d));
  }

  // Collect entries per day
  const dayEntries = new Map<string, WbsoEntry[]>();
  for (const d of dayDates) dayEntries.set(d, []);

  // -----------------------------------------------------------------------
  // Phase 1: Place meetings
  // -----------------------------------------------------------------------
  const meetingRows = await db
    .select()
    .from(meetings)
    .where(
      and(
        gte(meetings.startsAt, monday),
        lt(meetings.startsAt, nextMonday),
        inArray(meetings.responseStatus, ["accepted", "tentative"])
      )
    );

  // Pre-fetch epic titles for meetings with epicKey
  const meetingEpicKeys = meetingRows
    .map((m) => m.epicKey)
    .filter((k): k is string => k !== null);
  const epicTitleMap = new Map<string, string>();
  if (meetingEpicKeys.length > 0) {
    const epicRows = await db
      .select({ key: tickets.key, title: tickets.title })
      .from(tickets)
      .where(inArray(tickets.key, [...new Set(meetingEpicKeys)]));
    for (const e of epicRows) epicTitleMap.set(e.key, e.title);
  }

  for (const m of meetingRows) {
    const dayStr = toAmsterdamDate(m.startsAt);
    const entries = dayEntries.get(dayStr);
    if (!entries) continue; // weekend meeting

    const durationMin =
      (m.endsAt.getTime() - m.startsAt.getTime()) / 1000 / 60;
    const hours = durationMin / 60;

    let category: WbsoCategory;
    if (m.category === "dev" && m.epicKey) {
      category = "dev_meeting";
    } else if (m.category === "dev") {
      category = "dev_misc";
    } else {
      category = "non_dev";
    }

    entries.push({
      category,
      ticketKey: null,
      ticketTitle: null,
      epicKey: m.epicKey,
      epicTitle: m.epicKey ? (epicTitleMap.get(m.epicKey) ?? null) : null,
      hours,
      meetingId: m.id,
      reasoning: {
        meetingTitle: m.title,
        meetingDuration: Math.round(durationMin),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Phase 2: Estimate coding hours from commits
  // -----------------------------------------------------------------------
  const commitRows = await db
    .select({
      sha: commits.sha,
      authoredAt: commits.authoredAt,
      mrId: commits.mergeRequestId,
      mrTitle: mergeRequests.title,
      additions: mergeRequests.additions,
      deletions: mergeRequests.deletions,
      commitCount: mergeRequests.commitCount,
      ticketKey: mergeRequests.ticketKey,
      authoredByMe: mergeRequests.authoredByMe,
    })
    .from(commits)
    .innerJoin(mergeRequests, eq(commits.mergeRequestId, mergeRequests.id))
    .where(
      and(
        gte(commits.authoredAt, monday),
        lt(commits.authoredAt, nextMonday),
        eq(mergeRequests.authoredByMe, true)
      )
    );

  // Pre-fetch ticket info for coding entries
  const ticketKeys = [
    ...new Set(commitRows.map((c) => c.ticketKey).filter((k): k is string => k !== null)),
  ];
  const ticketInfoMap = new Map<
    string,
    { title: string; epicKey: string | null }
  >();
  if (ticketKeys.length > 0) {
    const ticketRows = await db
      .select({
        key: tickets.key,
        title: tickets.title,
        epicKey: tickets.epicKey,
      })
      .from(tickets)
      .where(inArray(tickets.key, ticketKeys));
    for (const t of ticketRows) {
      ticketInfoMap.set(t.key, { title: t.title, epicKey: t.epicKey });
    }
  }

  // Group commits by (day, MR)
  type CommitGroup = {
    dayStr: string;
    mrId: number;
    mrTitle: string;
    additions: number;
    deletions: number;
    totalCommits: number;
    dayCommits: number;
    ticketKey: string | null;
  };

  const groupKey = (dayStr: string, mrId: number) => `${dayStr}:${mrId}`;
  const commitGroups = new Map<string, CommitGroup>();

  for (const c of commitRows) {
    const dayStr = toAmsterdamDate(c.authoredAt);
    if (!dayEntries.has(dayStr)) continue; // weekend

    const key = groupKey(dayStr, c.mrId);
    let group = commitGroups.get(key);
    if (!group) {
      group = {
        dayStr,
        mrId: c.mrId,
        mrTitle: c.mrTitle,
        additions: c.additions,
        deletions: c.deletions,
        totalCommits: c.commitCount,
        dayCommits: 0,
        ticketKey: c.ticketKey,
      };
      commitGroups.set(key, group);
    }
    group.dayCommits++;
  }

  // Distribute MR effort across days by commit proportion
  for (const group of commitGroups.values()) {
    const mrEffort = clamp(
      0.5,
      (group.additions + group.deletions) / 80,
      4.0
    );
    const dayProportion =
      group.totalCommits > 0 ? group.dayCommits / group.totalCommits : 1;
    const hours = mrEffort * dayProportion;

    const ticketInfo = group.ticketKey
      ? ticketInfoMap.get(group.ticketKey)
      : null;
    const epicKey = ticketInfo?.epicKey ?? null;

    const entries = dayEntries.get(group.dayStr);
    if (!entries) continue;

    entries.push({
      category: "coding",
      ticketKey: group.ticketKey,
      ticketTitle: ticketInfo?.title ?? null,
      epicKey,
      epicTitle: epicKey ? (epicTitleMap.get(epicKey) ?? null) : null,
      hours,
      reasoning: {
        commitCount: group.dayCommits,
        totalAdditions: group.additions,
        totalDeletions: group.deletions,
        mrTitles: [group.mrTitle],
      },
    });
  }

  // -----------------------------------------------------------------------
  // Phase 3: Code review hours
  // -----------------------------------------------------------------------
  const reviewEvents = await db
    .select({
      occurredAt: mergeRequestEvents.occurredAt,
      mrId: mergeRequestEvents.mergeRequestId,
      mrTitle: mergeRequests.title,
      ticketKey: mergeRequests.ticketKey,
    })
    .from(mergeRequestEvents)
    .innerJoin(
      mergeRequests,
      eq(mergeRequestEvents.mergeRequestId, mergeRequests.id)
    )
    .where(
      and(
        eq(mergeRequestEvents.eventType, "commented"),
        eq(mergeRequests.authoredByMe, false),
        gte(mergeRequestEvents.occurredAt, monday),
        lt(mergeRequestEvents.occurredAt, nextMonday)
      )
    );

  // Group review comments by (day, MR)
  const reviewGroups = new Map<
    string,
    { dayStr: string; mrId: number; mrTitle: string; ticketKey: string | null; count: number }
  >();
  for (const e of reviewEvents) {
    const dayStr = toAmsterdamDate(e.occurredAt);
    if (!dayEntries.has(dayStr)) continue;

    const key = `${dayStr}:${e.mrId}`;
    let group = reviewGroups.get(key);
    if (!group) {
      group = {
        dayStr,
        mrId: e.mrId,
        mrTitle: e.mrTitle,
        ticketKey: e.ticketKey,
        count: 0,
      };
      reviewGroups.set(key, group);
    }
    group.count++;
  }

  for (const group of reviewGroups.values()) {
    const hours = 0.5 + (group.count - 1) * 0.15;
    const ticketInfo = group.ticketKey
      ? ticketInfoMap.get(group.ticketKey)
      : null;
    const epicKey = ticketInfo?.epicKey ?? null;

    const entries = dayEntries.get(group.dayStr);
    if (!entries) continue;

    entries.push({
      category: group.ticketKey ? "coding" : "dev_misc",
      ticketKey: group.ticketKey,
      ticketTitle: ticketInfo?.title ?? null,
      epicKey,
      epicTitle: epicKey ? (epicTitleMap.get(epicKey) ?? null) : null,
      hours,
      reasoning: {
        mrTitles: [group.mrTitle],
      },
    });
  }

  // -----------------------------------------------------------------------
  // Phase 4: Cap at 8h/day
  // -----------------------------------------------------------------------
  for (const [dayStr, entries] of dayEntries) {
    const meetingHours = entries
      .filter(
        (e) =>
          e.category === "dev_meeting" ||
          e.category === "dev_misc" ||
          e.category === "non_dev"
      )
      .reduce((sum, e) => sum + e.hours, 0);

    const codingEntries = entries.filter((e) => e.category === "coding");
    const totalCoding = codingEntries.reduce((sum, e) => sum + e.hours, 0);

    const availableCodingHours = Math.max(0, 8 - meetingHours);

    if (totalCoding > availableCodingHours && totalCoding > 0) {
      const scale = availableCodingHours / totalCoding;
      for (const e of codingEntries) {
        e.hours = e.hours * scale;
      }
    }

    // Also cap meetings if they exceed 8h
    const totalAfterScale = entries.reduce((sum, e) => sum + e.hours, 0);
    if (totalAfterScale > 8) {
      const scale = 8 / totalAfterScale;
      for (const e of entries) {
        e.hours = e.hours * scale;
      }
    }

    // Round to quarter hours
    for (const e of entries) {
      e.hours = roundQuarter(e.hours);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 5: Build response
  // -----------------------------------------------------------------------

  // Pre-fetch all epic titles we might need
  const allEpicKeys = new Set<string>();
  for (const entries of dayEntries.values()) {
    for (const e of entries) {
      if (e.epicKey) allEpicKeys.add(e.epicKey);
    }
  }
  if (allEpicKeys.size > 0) {
    const epicRows = await db
      .select({ key: tickets.key, title: tickets.title })
      .from(tickets)
      .where(inArray(tickets.key, [...allEpicKeys]));
    for (const e of epicRows) epicTitleMap.set(e.key, e.title);
  }
  // Fill in any missing epic titles
  for (const entries of dayEntries.values()) {
    for (const e of entries) {
      if (e.epicKey && !e.epicTitle) {
        e.epicTitle = epicTitleMap.get(e.epicKey) ?? null;
      }
    }
  }

  const days: WbsoDayData[] = dayDates.map((date, i) => {
    const entries = dayEntries.get(date) ?? [];
    return {
      date,
      dayLabel: DAY_LABELS[i],
      totalHours: roundQuarter(entries.reduce((sum, e) => sum + e.hours, 0)),
      entries,
    };
  });

  // Category totals
  const totals: WbsoCategoryTotals = {
    coding: 0,
    devMeeting: 0,
    devMisc: 0,
    nonDev: 0,
    total: 0,
  };
  for (const day of days) {
    for (const e of day.entries) {
      switch (e.category) {
        case "coding":
          totals.coding += e.hours;
          break;
        case "dev_meeting":
          totals.devMeeting += e.hours;
          break;
        case "dev_misc":
          totals.devMisc += e.hours;
          break;
        case "non_dev":
          totals.nonDev += e.hours;
          break;
      }
    }
  }
  totals.total = totals.coding + totals.devMeeting + totals.devMisc + totals.nonDev;
  // Round all totals
  for (const k of Object.keys(totals) as (keyof WbsoCategoryTotals)[]) {
    totals[k] = roundQuarter(totals[k]);
  }

  // By epic
  const epicMap = new Map<
    string,
    { epicTitle: string; coding: number; devMeeting: number; devMisc: number }
  >();
  for (const day of days) {
    for (const e of day.entries) {
      if (!e.epicKey || e.category === "non_dev") continue;
      let epic = epicMap.get(e.epicKey);
      if (!epic) {
        epic = {
          epicTitle: e.epicTitle ?? e.epicKey,
          coding: 0,
          devMeeting: 0,
          devMisc: 0,
        };
        epicMap.set(e.epicKey, epic);
      }
      switch (e.category) {
        case "coding":
          epic.coding += e.hours;
          break;
        case "dev_meeting":
          epic.devMeeting += e.hours;
          break;
        case "dev_misc":
          epic.devMisc += e.hours;
          break;
      }
    }
  }

  const byEpic: WbsoEpicSummary[] = [...epicMap.entries()]
    .map(([epicKey, data]) => ({
      epicKey,
      epicTitle: data.epicTitle,
      totalHours: roundQuarter(data.coding + data.devMeeting + data.devMisc),
      categories: {
        coding: roundQuarter(data.coding),
        devMeeting: roundQuarter(data.devMeeting),
        devMisc: roundQuarter(data.devMisc),
      },
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  // Unlinked MRs: authored by me, no ticket, with commits in this week
  const unlinkedMrRows = await db
    .select({
      id: mergeRequests.id,
      gitlabIid: mergeRequests.gitlabIid,
      title: mergeRequests.title,
      branchName: mergeRequests.branchName,
      commitCount: mergeRequests.commitCount,
      additions: mergeRequests.additions,
      deletions: mergeRequests.deletions,
    })
    .from(mergeRequests)
    .innerJoin(commits, eq(commits.mergeRequestId, mergeRequests.id))
    .where(
      and(
        eq(mergeRequests.authoredByMe, true),
        isNull(mergeRequests.ticketKey),
        gte(commits.authoredAt, monday),
        lt(commits.authoredAt, nextMonday)
      )
    );

  // Deduplicate (one MR can have multiple commits in the week)
  const unlinkedMRs: WbsoUnlinkedMR[] = [];
  const seenMrIds = new Set<number>();
  for (const mr of unlinkedMrRows) {
    if (seenMrIds.has(mr.id)) continue;
    seenMrIds.add(mr.id);
    unlinkedMRs.push(mr);
  }

  return {
    weekStart: dayDates[0],
    weekEnd: dayDates[4],
    days,
    totals,
    byEpic,
    unlinkedMRs,
  };
}
