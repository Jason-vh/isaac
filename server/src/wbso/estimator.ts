import { db } from "../db";
import {
  meetings,
  mergeRequests,
  mergeRequestEvents,
  commits,
  tickets,
  wbsoEntryMarks,
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
import { wbsoRowKey } from "@isaac/shared";
import { allocateDay, HOURS_PER_DAY } from "./allocate";
import {
  addDays,
  amsterdamDayStart,
  toAmsterdamDate,
  todayInAmsterdam,
  type DateString,
} from "../lib/calendar";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Reviewing a diff is faster than writing it. */
const REVIEW_WEIGHT_FACTOR = 0.1;

// Used only when an MR's file stats came back as 0, so a day with real activity
// still carries weight. These are not floors: clamping every small MR up to
// them would flatten the proportional split into a fixed 6:1 ratio.
const CODING_FALLBACK_WEIGHT = 60;
const REVIEW_FALLBACK_WEIGHT = 10;

/** An entry before its mark state is resolved, which happens once at assembly. */
type DraftEntry = Omit<WbsoEntry, "rowKey" | "marked" | "markedHours">;

type WeightedEntry = {
  category: WbsoCategory;
  ticketKey: string | null;
  ticketTitle: string | null;
  epicKey: string | null;
  epicTitle: string | null;
  weight: number;
  reasoning: WbsoReasoning;
};

/** An empty week, for a Monday that hasn't arrived yet. */
function emptyWeek(monday: DateString): WbsoWeekData {
  return {
    weekStart: monday,
    weekEnd: addDays(monday, 4),
    jiraBrowseUrl: `${env.JIRA_BASE_URL}/browse`,
    gitlabBaseUrl: env.GITLAB_BASE_URL,
    epicDates: {},
    days: [],
    totals: {
      coding: 0,
      codeReview: 0,
      devMeeting: 0,
      devMisc: 0,
      nonDev: 0,
      leave: 0,
      total: 0,
    },
    byEpic: [],
    unlinkedMRs: [],
  };
}

export async function estimateWeek(monday: DateString): Promise<WbsoWeekData> {
  // Only include days up to and including today (no future days)
  const today = todayInAmsterdam();

  const dayDates: DateString[] = [];
  for (let i = 0; i < 5; i++) {
    const date = addDays(monday, i);
    if (date > today) break;
    dayDates.push(date);
  }

  if (dayDates.length === 0) return emptyWeek(monday);

  // Bucketing is Amsterdam-local, so the query window has to be too.
  const windowStart = amsterdamDayStart(dayDates[0]);
  const windowEnd = amsterdamDayStart(addDays(dayDates[dayDates.length - 1], 1));

  // Per-day buckets
  const dayMeetings = new Map<string, DraftEntry[]>();
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
        gte(meetings.startsAt, windowStart),
        lt(meetings.startsAt, windowEnd),
        inArray(meetings.responseStatus, ["accepted", "tentative", "needsAction"])
      )
    );

  const meetingKeys = meetingRows
    .flatMap((m) => [m.epicKey, m.ticketKey])
    .filter((k): k is string => k !== null);
  const epicTitleMap = new Map<string, string>();
  if (meetingKeys.length > 0) {
    const epicRows = await db
      .select({ key: tickets.key, title: tickets.title })
      .from(tickets)
      .where(inArray(tickets.key, [...new Set(meetingKeys)]));
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
            ticketKey: m.ticketKey,
            ticketTitle: m.ticketKey
              ? (epicTitleMap.get(m.ticketKey) ?? null)
              : null,
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
        ticketKey: m.ticketKey,
        ticketTitle: m.ticketKey ? (epicTitleMap.get(m.ticketKey) ?? null) : null,
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
      changesCount: mergeRequests.filesChanged,
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
        gte(commits.authoredAt, windowStart),
        lt(commits.authoredAt, windowEnd),
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
    const weight = rawWeight > 0 ? rawWeight : CODING_FALLBACK_WEIGHT;

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
      changesCount: mergeRequests.filesChanged,
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
        gte(mergeRequestEvents.occurredAt, windowStart),
        lt(mergeRequestEvents.occurredAt, windowEnd)
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
    const weight = rawWeight > 0 ? rawWeight : REVIEW_FALLBACK_WEIGHT;
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
  const dayEntries = new Map<string, DraftEntry[]>();
  const needsInputDays = new Set<string>();

  for (const dayStr of dayDates) {
    const meetingEntries = [...(dayMeetings.get(dayStr) ?? [])];

    // Leave fills the whole day — nothing else is placed on it.
    if (leaveDays.has(dayStr)) {
      const leave = meetingEntries.find((e) => e.category === "leave");
      if (leave) {
        leave.hours = HOURS_PER_DAY;
        dayEntries.set(dayStr, [leave]);
      } else {
        dayEntries.set(dayStr, meetingEntries);
      }
      continue;
    }

    const weighted: WeightedEntry[] = [
      ...(dayCodingWeights.get(dayStr) ?? []),
      ...(dayReviewWeights.get(dayStr) ?? []),
    ];

    const allocation = allocateDay(
      meetingEntries.map((e) => e.hours),
      weighted.map((w) => w.weight)
    );

    if (allocation.needsInput) needsInputDays.add(dayStr);

    meetingEntries.forEach((entry, i) => {
      entry.hours = allocation.meetings[i];
    });

    // Driven by the allocation, not the weights: a day whose meetings already
    // fill 8h gets no activity entries even though it has weighted activity.
    const activityEntries: DraftEntry[] = allocation.activity.map((hours, i) => ({
      category: weighted[i].category,
      ticketKey: weighted[i].ticketKey,
      ticketTitle: weighted[i].ticketTitle,
      epicKey: weighted[i].epicKey,
      epicTitle: weighted[i].epicTitle,
      hours,
      reasoning: weighted[i].reasoning,
    }));

    dayEntries.set(dayStr, [...meetingEntries, ...activityEntries]);
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

  // Mark state, keyed by day + rowKey
  const markRows = dayDates.length
    ? await db
        .select()
        .from(wbsoEntryMarks)
        .where(inArray(wbsoEntryMarks.date, dayDates))
    : [];
  const markMap = new Map(
    markRows.map((m) => [`${m.date}|${m.rowKey}`, Number(m.hours)])
  );

  const days: WbsoDayData[] = dayDates.map((date, i) => {
    const drafts = dayEntries.get(date) ?? [];
    const entries: WbsoEntry[] = drafts.map((draft) => {
      const rowKey = wbsoRowKey(draft);
      const markedHours = markMap.get(`${date}|${rowKey}`);
      return {
        ...draft,
        rowKey,
        marked: markedHours !== undefined,
        markedHours: markedHours ?? null,
      };
    });
    return {
      date,
      dayLabel: DAY_LABELS[i],
      totalHours: entries.reduce((sum, e) => sum + e.hours, 0),
      needsInput: needsInputDays.has(date),
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
      changesCount: mergeRequests.filesChanged,
    })
    .from(mergeRequests)
    .innerJoin(commits, eq(commits.mergeRequestId, mergeRequests.id))
    .where(
      and(
        eq(mergeRequests.authoredByMe, true),
        isNull(mergeRequests.ticketKey),
        gte(commits.authoredAt, windowStart),
        lt(commits.authoredAt, windowEnd)
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
      changesCount: mergeRequests.filesChanged,
    })
    .from(mergeRequests)
    .innerJoin(mergeRequestEvents, eq(mergeRequestEvents.mergeRequestId, mergeRequests.id))
    .where(
      and(
        eq(mergeRequests.authoredByMe, false),
        isNull(mergeRequests.ticketKey),
        eq(mergeRequestEvents.eventType, "commented"),
        gte(mergeRequestEvents.occurredAt, windowStart),
        lt(mergeRequestEvents.occurredAt, windowEnd)
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
    // The week is truncated at today, so this is the last day estimated.
    weekEnd: dayDates[dayDates.length - 1],
    jiraBrowseUrl: `${env.JIRA_BASE_URL}/browse`,
    gitlabBaseUrl: env.GITLAB_BASE_URL,
    epicDates: Object.fromEntries(epicCreatedMap),
    days,
    totals,
    byEpic,
    unlinkedMRs,
  };
}
