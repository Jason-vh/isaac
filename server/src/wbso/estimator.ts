import { db } from "../db";
import {
  meetings,
  mergeRequests,
  mergeRequestEvents,
  commits,
  tickets,
} from "../db/schema";
import { and, eq, gte, lt, inArray, isNull } from "drizzle-orm";
import { env } from "../env";
import type {
  WbsoEntry,
  WbsoDayData,
  WbsoCategoryTotals,
  WbsoEpicSummary,
  WbsoUnlinkedMR,
  WbsoWeekData,
  WbsoCategory,
  WbsoReasoning,
} from "@isaac/shared";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS_PER_DAY = 8;
const REVIEW_WEIGHT_FACTOR = 0.1;
const CODING_MIN_WEIGHT = 60; // fallback when MR stats are 0
const REVIEW_MIN_WEIGHT = 10; // fallback when MR stats are 0
const MIN_ENTRY_HOURS = 0.25;
const MIN_REVIEW_HOURS = 10 / 60; // 10 minutes

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Convert a timestamp to Amsterdam-local date string (YYYY-MM-DD)
function toAmsterdamDate(ts: Date): string {
  return ts.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

/**
 * Rounds hours to quarter-hour increments while preserving a target total.
 * Uses the largest-remainder method (Hamilton's method).
 */
function roundToQuartersPreservingTotal(
  entries: { hours: number }[],
  target: number
): void {
  if (entries.length === 0) return;

  const targetQuarters = Math.round(target * 4);
  const floors = entries.map((e) => Math.floor(e.hours * 4));
  const remainders = entries.map((e, i) => e.hours * 4 - floors[i]);
  let deficit = targetQuarters - floors.reduce((a, b) => a + b, 0);

  // Sort indices by remainder descending, distribute surplus quarter-hours
  const indices = entries.map((_, i) => i);
  indices.sort((a, b) => remainders[b] - remainders[a]);
  for (const i of indices) {
    if (deficit <= 0) break;
    floors[i]++;
    deficit--;
  }

  for (let i = 0; i < entries.length; i++) {
    entries[i].hours = floors[i] / 4;
  }
}

type WeightedEntry = {
  category: WbsoCategory;
  ticketKey: string | null;
  ticketTitle: string | null;
  epicKey: string | null;
  epicTitle: string | null;
  weight: number;
  reasoning: WbsoReasoning;
};

export async function estimateWeek(monday: Date): Promise<WbsoWeekData> {
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  // Only include days up to and including today (no future days)
  const today = toAmsterdamDate(new Date());

  const dayDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = formatDate(d);
    if (dateStr > today) break;
    dayDates.push(dateStr);
  }

  // Per-day buckets
  const dayMeetings = new Map<string, WbsoEntry[]>();
  const dayCodingWeights = new Map<string, WeightedEntry[]>();
  const dayReviewWeights = new Map<string, WeightedEntry[]>();
  for (const d of dayDates) {
    dayMeetings.set(d, []);
    dayCodingWeights.set(d, []);
    dayReviewWeights.set(d, []);
  }

  // -----------------------------------------------------------------------
  // Phase 1: Place meetings (actual durations)
  // -----------------------------------------------------------------------
  const meetingRows = await db
    .select()
    .from(meetings)
    .where(
      and(
        gte(meetings.startsAt, monday),
        lt(meetings.startsAt, nextMonday),
        inArray(meetings.responseStatus, ["accepted", "tentative", "needsAction"])
      )
    );

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

  // Track which days are fully leave (leave fills the entire day)
  const leaveDays = new Set<string>();

  for (const m of meetingRows) {
    // Skip ignored events (location markers like Home/Office)
    if (m.category === "ignore") continue;

    let category: WbsoCategory;
    if (m.category === "leave") {
      category = "leave";
    } else if (m.category === "dev" && m.epicKey) {
      category = "dev_meeting";
    } else if (m.category === "dev") {
      category = "dev_misc";
    } else {
      category = "non_dev";
    }

    // All-day / multi-day events (like sick/OOO): place on each weekday they cover
    const durationHours =
      (m.endsAt.getTime() - m.startsAt.getTime()) / 1000 / 60 / 60;
    const isAllDay = durationHours >= 23; // ≥23h = all-day event

    if (isAllDay) {
      // Place on every weekday this event spans (using Amsterdam timezone)
      const eventStartDay = toAmsterdamDate(m.startsAt);
      // End is exclusive for all-day events (midnight after last day), so subtract 1ms
      const eventEndDay = toAmsterdamDate(new Date(m.endsAt.getTime() - 1));
      for (const dayStr of dayDates) {
        if (dayStr >= eventStartDay && dayStr <= eventEndDay) {
          const entries = dayMeetings.get(dayStr);
          if (!entries) continue;
          if (category === "leave") leaveDays.add(dayStr);
          entries.push({
            category,
            ticketKey: null,
            ticketTitle: null,
            epicKey: m.epicKey,
            epicTitle: m.epicKey ? (epicTitleMap.get(m.epicKey) ?? null) : null,
            hours: HOURS_PER_DAY,
            meetingId: m.id,
            reasoning: {
              meetingTitle: m.title,
              meetingDuration: HOURS_PER_DAY * 60,
              meeting: {
                id: m.id,
                title: m.title,
                startsAt: m.startsAt.toISOString(),
                endsAt: m.endsAt.toISOString(),
                durationMinutes: HOURS_PER_DAY * 60,
              },
            },
          });
        }
      }
    } else {
      const dayStr = toAmsterdamDate(m.startsAt);
      const entries = dayMeetings.get(dayStr);
      if (!entries) continue;

      const durationMin =
        (m.endsAt.getTime() - m.startsAt.getTime()) / 1000 / 60;

      entries.push({
        category,
        ticketKey: null,
        ticketTitle: null,
        epicKey: m.epicKey,
        epicTitle: m.epicKey ? (epicTitleMap.get(m.epicKey) ?? null) : null,
        hours: durationMin / 60,
        meetingId: m.id,
        reasoning: {
          meetingTitle: m.title,
          meetingDuration: Math.round(durationMin),
          meeting: {
            id: m.id,
            title: m.title,
            startsAt: m.startsAt.toISOString(),
            endsAt: m.endsAt.toISOString(),
            durationMinutes: Math.round(durationMin),
          },
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Compute coding activity weights
  // weight = changesCount * (dayCommits / totalCommits)
  // -----------------------------------------------------------------------
  const commitRows = await db
    .select({
      sha: commits.sha,
      commitTitle: commits.title,
      authoredAt: commits.authoredAt,
      mrId: commits.mergeRequestId,
      mrTitle: mergeRequests.title,
      changesCount: mergeRequests.changesCount,
      commitCount: mergeRequests.commitCount,
      ticketKey: mergeRequests.ticketKey,
      gitlabIid: mergeRequests.gitlabIid,
      projectPath: mergeRequests.projectPath,
      mrStatus: mergeRequests.status,
      branchName: mergeRequests.branchName,
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

  const ticketKeys = [
    ...new Set(
      commitRows
        .map((c) => c.ticketKey)
        .filter((k): k is string => k !== null)
    ),
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
    changesCount: number;
    totalCommits: number;
    dayCommits: number;
    ticketKey: string | null;
    gitlabIid: number;
    projectPath: string;
    mrStatus: string;
    branchName: string;
    commits: { sha: string; title: string; authoredAt: string }[];
  };

  const commitGroups = new Map<string, CommitGroup>();
  for (const c of commitRows) {
    const dayStr = toAmsterdamDate(c.authoredAt);
    if (!dayCodingWeights.has(dayStr)) continue;

    const key = `${dayStr}:${c.mrId}`;
    let group = commitGroups.get(key);
    if (!group) {
      group = {
        dayStr,
        mrId: c.mrId,
        mrTitle: c.mrTitle,
        changesCount: c.changesCount,
        totalCommits: c.commitCount,
        dayCommits: 0,
        ticketKey: c.ticketKey,
        gitlabIid: c.gitlabIid,
        projectPath: c.projectPath,
        mrStatus: c.mrStatus,
        branchName: c.branchName,
        commits: [],
      };
      commitGroups.set(key, group);
    }
    group.dayCommits++;
    group.commits.push({
      sha: c.sha,
      title: c.commitTitle,
      authoredAt: c.authoredAt.toISOString(),
    });
  }

  for (const group of commitGroups.values()) {
    const dayProportion =
      group.totalCommits > 0 ? group.dayCommits / group.totalCommits : 1;
    const rawWeight = group.changesCount * dayProportion;
    const weight = Math.max(rawWeight, CODING_MIN_WEIGHT);

    const ticketInfo = group.ticketKey
      ? ticketInfoMap.get(group.ticketKey)
      : null;
    const epicKey = ticketInfo?.epicKey ?? null;

    dayCodingWeights.get(group.dayStr)?.push({
      category: "coding",
      ticketKey: group.ticketKey,
      ticketTitle: ticketInfo?.title ?? null,
      epicKey,
      epicTitle: epicKey ? (epicTitleMap.get(epicKey) ?? null) : null,
      weight,
      reasoning: {
        commitCount: group.dayCommits,
        totalChanges: group.changesCount,
        mrTitles: [group.mrTitle],
        mergeRequests: [{
          id: group.mrId,
          gitlabIid: group.gitlabIid,
          projectPath: group.projectPath,
          title: group.mrTitle,
          status: group.mrStatus,
          changesCount: group.changesCount,
          branchName: group.branchName,
        }],
        commits: group.commits,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Phase 3: Compute code review activity weights
  // weight = changesCount * REVIEW_WEIGHT_FACTOR
  // -----------------------------------------------------------------------
  const reviewEvents = await db
    .select({
      occurredAt: mergeRequestEvents.occurredAt,
      mrId: mergeRequestEvents.mergeRequestId,
      mrTitle: mergeRequests.title,
      ticketKey: mergeRequests.ticketKey,
      changesCount: mergeRequests.changesCount,
      gitlabIid: mergeRequests.gitlabIid,
      projectPath: mergeRequests.projectPath,
      mrStatus: mergeRequests.status,
      branchName: mergeRequests.branchName,
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

  // Group by (day, MR) — one review entry per MR per day
  const reviewGroups = new Map<
    string,
    {
      dayStr: string;
      mrId: number;
      mrTitle: string;
      ticketKey: string | null;
      changesCount: number;
      gitlabIid: number;
      projectPath: string;
      mrStatus: string;
      branchName: string;
    }
  >();
  for (const e of reviewEvents) {
    const dayStr = toAmsterdamDate(e.occurredAt);
    if (!dayReviewWeights.has(dayStr)) continue;

    const key = `${dayStr}:${e.mrId}`;
    if (!reviewGroups.has(key)) {
      reviewGroups.set(key, {
        dayStr,
        mrId: e.mrId,
        mrTitle: e.mrTitle,
        ticketKey: e.ticketKey,
        changesCount: e.changesCount,
        gitlabIid: e.gitlabIid,
        projectPath: e.projectPath,
        mrStatus: e.mrStatus,
        branchName: e.branchName,
      });
    }
  }

  // Also fetch ticket info for review MRs
  const reviewTicketKeys = [
    ...new Set(
      [...reviewGroups.values()]
        .map((g) => g.ticketKey)
        .filter((k): k is string => k !== null)
    ),
  ];
  if (reviewTicketKeys.length > 0) {
    const ticketRows = await db
      .select({
        key: tickets.key,
        title: tickets.title,
        epicKey: tickets.epicKey,
      })
      .from(tickets)
      .where(inArray(tickets.key, reviewTicketKeys));
    for (const t of ticketRows) {
      if (!ticketInfoMap.has(t.key)) {
        ticketInfoMap.set(t.key, { title: t.title, epicKey: t.epicKey });
      }
    }
  }

  for (const group of reviewGroups.values()) {
    const rawWeight = group.changesCount * REVIEW_WEIGHT_FACTOR;
    const weight = Math.max(rawWeight, REVIEW_MIN_WEIGHT);
    const ticketInfo = group.ticketKey
      ? ticketInfoMap.get(group.ticketKey)
      : null;
    const epicKey = ticketInfo?.epicKey ?? null;

    dayReviewWeights.get(group.dayStr)?.push({
      category: "code_review",
      ticketKey: group.ticketKey,
      ticketTitle: ticketInfo?.title ?? null,
      epicKey,
      epicTitle: epicKey ? (epicTitleMap.get(epicKey) ?? null) : null,
      weight,
      reasoning: {
        mrTitles: [group.mrTitle],
        mergeRequests: [{
          id: group.mrId,
          gitlabIid: group.gitlabIid,
          projectPath: group.projectPath,
          title: group.mrTitle,
          status: group.mrStatus,
          changesCount: group.changesCount,
          branchName: group.branchName,
        }],
      },
    });
  }

  // -----------------------------------------------------------------------
  // Phase 4: Fill every day to exactly 8h
  // -----------------------------------------------------------------------
  const dayEntries = new Map<string, WbsoEntry[]>();

  for (let i = 0; i < dayDates.length; i++) {
    const dayStr = dayDates[i];
    const meetingEntries = dayMeetings.get(dayStr) ?? [];
    const entries: WbsoEntry[] = [...meetingEntries];

    // Leave day — just show the leave entry at 8h, skip everything else
    if (leaveDays.has(dayStr)) {
      const leaveEntries = entries.filter((e) => e.category === "leave");
      // Keep only the first leave entry at 8h
      if (leaveEntries.length > 0) {
        leaveEntries[0].hours = HOURS_PER_DAY;
        dayEntries.set(dayStr, [leaveEntries[0]]);
      } else {
        dayEntries.set(dayStr, entries);
      }
      continue;
    }

    const meetingHours = entries.reduce((sum, e) => sum + e.hours, 0);

    if (meetingHours >= HOURS_PER_DAY) {
      // Meetings alone fill or exceed the day — scale them to fit 8h
      const scale = HOURS_PER_DAY / meetingHours;
      for (const e of entries) e.hours *= scale;
      roundToQuartersPreservingTotal(entries, HOURS_PER_DAY);
      dayEntries.set(dayStr, entries);
      continue;
    }

    const available = HOURS_PER_DAY - meetingHours;

    // Gather weighted activity for this day
    let weighted: WeightedEntry[] = [
      ...(dayCodingWeights.get(dayStr) ?? []),
      ...(dayReviewWeights.get(dayStr) ?? []),
    ];

    // Zero-activity day: borrow coding weights from the next weekday that has them
    if (weighted.length === 0) {
      for (let j = i + 1; j < dayDates.length; j++) {
        const nextDayCoding = dayCodingWeights.get(dayDates[j]) ?? [];
        if (nextDayCoding.length > 0) {
          // Copy weights — same tickets, same proportions
          weighted = nextDayCoding.map((w) => ({ ...w }));
          break;
        }
      }
    }

    // Still nothing — allocate entire available block as dev_misc
    if (weighted.length === 0) {
      entries.push({
        category: "dev_misc",
        ticketKey: null,
        ticketTitle: null,
        epicKey: null,
        epicTitle: null,
        hours: available,
        reasoning: {},
      });
      roundToQuartersPreservingTotal(entries, HOURS_PER_DAY);
      dayEntries.set(dayStr, entries);
      continue;
    }

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

    // Convert weights → proportional hours
    const activityEntries: WbsoEntry[] = weighted.map((w) => ({
      category: w.category,
      ticketKey: w.ticketKey,
      ticketTitle: w.ticketTitle,
      epicKey: w.epicKey,
      epicTitle: w.epicTitle,
      hours:
        totalWeight > 0
          ? (w.weight / totalWeight) * available
          : available / weighted.length,
      reasoning: w.reasoning,
    }));

    // Enforce minimum per entry (10 min for reviews, 15 min for others)
    const minForEntry = (e: WbsoEntry) =>
      e.category === "code_review" ? MIN_REVIEW_HOURS : MIN_ENTRY_HOURS;
    const minTotal = activityEntries.reduce((s, e) => s + minForEntry(e), 0);
    if (minTotal >= available) {
      // Too many small entries for the available time — distribute evenly
      for (const e of activityEntries) e.hours = available / activityEntries.length;
    } else {
      let deficit = 0;
      let aboveMinTotal = 0;
      for (const e of activityEntries) {
        const min = minForEntry(e);
        if (e.hours < min) {
          deficit += min - e.hours;
          e.hours = min;
        } else {
          aboveMinTotal += e.hours;
        }
      }
      if (deficit > 0 && aboveMinTotal > 0) {
        const scale = (aboveMinTotal - deficit) / aboveMinTotal;
        for (const e of activityEntries) {
          if (e.hours > minForEntry(e)) {
            e.hours *= scale;
          }
        }
      }
    }

    entries.push(...activityEntries);
    roundToQuartersPreservingTotal(entries, HOURS_PER_DAY);
    dayEntries.set(dayStr, entries);
  }

  // -----------------------------------------------------------------------
  // Phase 5: Build response
  // -----------------------------------------------------------------------

  // Ensure all epic titles are resolved
  const allEpicKeys = new Set<string>();
  for (const entries of dayEntries.values()) {
    for (const e of entries) {
      if (e.epicKey) allEpicKeys.add(e.epicKey);
    }
  }
  const epicCreatedMap = new Map<string, string>();
  if (allEpicKeys.size > 0) {
    const epicRows = await db
      .select({ key: tickets.key, title: tickets.title, jiraCreatedAt: tickets.jiraCreatedAt })
      .from(tickets)
      .where(inArray(tickets.key, [...allEpicKeys]));
    for (const e of epicRows) {
      epicTitleMap.set(e.key, e.title);
      epicCreatedMap.set(e.key, e.jiraCreatedAt.toISOString());
    }
  }
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
      totalHours: entries.reduce((sum, e) => sum + e.hours, 0),
      entries,
    };
  });

  // Category totals
  const totals: WbsoCategoryTotals = {
    coding: 0,
    codeReview: 0,
    devMeeting: 0,
    devMisc: 0,
    nonDev: 0,
    leave: 0,
    total: 0,
  };
  for (const day of days) {
    for (const e of day.entries) {
      switch (e.category) {
        case "coding":
          totals.coding += e.hours;
          break;
        case "code_review":
          totals.codeReview += e.hours;
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
        case "leave":
          totals.leave += e.hours;
          break;
      }
    }
  }
  totals.total =
    totals.coding + totals.codeReview + totals.devMeeting + totals.devMisc + totals.nonDev + totals.leave;
  // Round totals to quarter hours
  for (const k of Object.keys(totals) as (keyof WbsoCategoryTotals)[]) {
    totals[k] = Math.round(totals[k] * 4) / 4;
  }

  // By epic
  const epicMap = new Map<
    string,
    {
      epicTitle: string;
      coding: number;
      codeReview: number;
      devMeeting: number;
      devMisc: number;
    }
  >();
  for (const day of days) {
    for (const e of day.entries) {
      if (!e.epicKey || e.category === "non_dev") continue;
      let epic = epicMap.get(e.epicKey);
      if (!epic) {
        epic = {
          epicTitle: e.epicTitle ?? e.epicKey,
          coding: 0,
          codeReview: 0,
          devMeeting: 0,
          devMisc: 0,
        };
        epicMap.set(e.epicKey, epic);
      }
      switch (e.category) {
        case "coding":
          epic.coding += e.hours;
          break;
        case "code_review":
          epic.codeReview += e.hours;
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
      jiraCreatedAt: epicCreatedMap.get(epicKey) ?? "",
      totalHours: Math.round((data.coding + data.codeReview + data.devMeeting + data.devMisc) * 4) / 4,
      categories: {
        coding: Math.round(data.coding * 4) / 4,
        codeReview: Math.round(data.codeReview * 4) / 4,
        devMeeting: Math.round(data.devMeeting * 4) / 4,
        devMisc: Math.round(data.devMisc * 4) / 4,
      },
    }))
    .sort((a, b) => b.jiraCreatedAt.localeCompare(a.jiraCreatedAt));

  // Unlinked MRs: authored by me, no ticket, with commits in this week
  const unlinkedAuthoredRows = await db
    .select({
      id: mergeRequests.id,
      gitlabIid: mergeRequests.gitlabIid,
      title: mergeRequests.title,
      branchName: mergeRequests.branchName,
      commitCount: mergeRequests.commitCount,
      changesCount: mergeRequests.changesCount,
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

  // Unlinked MRs: reviewed by me, no ticket, with review events in this week
  const unlinkedReviewedRows = await db
    .select({
      id: mergeRequests.id,
      gitlabIid: mergeRequests.gitlabIid,
      title: mergeRequests.title,
      branchName: mergeRequests.branchName,
      commitCount: mergeRequests.commitCount,
      changesCount: mergeRequests.changesCount,
    })
    .from(mergeRequests)
    .innerJoin(mergeRequestEvents, eq(mergeRequestEvents.mergeRequestId, mergeRequests.id))
    .where(
      and(
        eq(mergeRequests.authoredByMe, false),
        isNull(mergeRequests.ticketKey),
        eq(mergeRequestEvents.eventType, "commented"),
        gte(mergeRequestEvents.occurredAt, monday),
        lt(mergeRequestEvents.occurredAt, nextMonday)
      )
    );

  const unlinkedMRs: WbsoUnlinkedMR[] = [];
  const seenMrIds = new Set<number>();
  for (const mr of unlinkedAuthoredRows) {
    if (seenMrIds.has(mr.id)) continue;
    seenMrIds.add(mr.id);
    unlinkedMRs.push({ ...mr, role: "authored" });
  }
  for (const mr of unlinkedReviewedRows) {
    if (seenMrIds.has(mr.id)) continue;
    seenMrIds.add(mr.id);
    unlinkedMRs.push({ ...mr, role: "reviewed" });
  }

  return {
    weekStart: dayDates[0],
    weekEnd: dayDates[4],
    jiraBrowseUrl: `${env.JIRA_BASE_URL}/browse`,
    gitlabBaseUrl: env.GITLAB_BASE_URL,
    epicDates: Object.fromEntries(epicCreatedMap),
    days,
    totals,
    byEpic,
    unlinkedMRs,
  };
}
