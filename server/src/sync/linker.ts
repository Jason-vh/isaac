import { db } from "../db";
import { mergeRequests, meetings, tickets } from "../db/schema";
import { eq, isNull, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Ticket key regex: matches patterns like PROJ-123
// ---------------------------------------------------------------------------

const TICKET_KEY_RE = /([A-Z][A-Z0-9]+-\d+)/;

// ---------------------------------------------------------------------------
// Meeting category heuristics
// ---------------------------------------------------------------------------

const DEV_KEYWORDS =
  /\b(standup|stand-up|sprint|retro|refinement|grooming|planning|tech|architecture|design review|code review|demo|deploy|incident|postmortem|post-mortem|1:1)\b/i;

const NON_DEV_KEYWORDS =
  /\b(all-hands|all hands|company|team social|lunch|offsite|hr|performance review)\b/i;

// ---------------------------------------------------------------------------
// MR → Ticket linking
// ---------------------------------------------------------------------------

export async function runLinker(): Promise<void> {
  console.log("[linker] Starting link inference...");

  // Select MRs where ticketKeyInferred = true (auto-linkable)
  const mrs = await db
    .select({
      id: mergeRequests.id,
      branchName: mergeRequests.branchName,
      ticketKey: mergeRequests.ticketKey,
    })
    .from(mergeRequests)
    .where(eq(mergeRequests.ticketKeyInferred, true));

  // Extract candidate ticket keys from branch names
  const candidates: Array<{ mrId: number; extractedKey: string }> = [];
  for (const mr of mrs) {
    const match = mr.branchName.match(TICKET_KEY_RE);
    if (!match) continue;

    const extractedKey = match[1];
    // Only update if the value actually changed
    if (extractedKey === mr.ticketKey) continue;

    candidates.push({ mrId: mr.id, extractedKey });
  }

  if (candidates.length === 0) {
    console.log("[linker] No new MR links to infer.");
  } else {
    // Validate extracted keys exist in tickets table (avoid FK violation)
    const candidateKeys = [...new Set(candidates.map((c) => c.extractedKey))];
    const existingTickets = await db
      .select({ key: tickets.key })
      .from(tickets)
      .where(inArray(tickets.key, candidateKeys));
    const validKeys = new Set(existingTickets.map((t) => t.key));

    let linked = 0;
    for (const { mrId, extractedKey } of candidates) {
      if (!validKeys.has(extractedKey)) continue;

      await db
        .update(mergeRequests)
        .set({ ticketKey: extractedKey, ticketKeyInferred: false })
        .where(eq(mergeRequests.id, mrId));
      linked++;
    }

    console.log(`[linker] Linked ${linked} MRs to tickets.`);
  }

  // Meeting auto-categorization
  await linkMeetings();
}

// ---------------------------------------------------------------------------
// Meeting → category/epic linking
// ---------------------------------------------------------------------------

async function linkMeetings(): Promise<void> {
  const unclassified = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      epicKeyInferred: meetings.epicKeyInferred,
    })
    .from(meetings)
    .where(isNull(meetings.category));

  if (unclassified.length === 0) {
    console.log("[linker] No unclassified meetings.");
    return;
  }

  // Pre-fetch ticket keys for FK validation of extracted keys
  const extractedKeys = new Set<string>();
  for (const m of unclassified) {
    const match = m.title.match(TICKET_KEY_RE);
    if (match) extractedKeys.add(match[1]);
  }

  let validTicketKeys = new Set<string>();
  let ticketEpicMap = new Map<string, string | null>();
  if (extractedKeys.size > 0) {
    const ticketRows = await db
      .select({ key: tickets.key, epicKey: tickets.epicKey })
      .from(tickets)
      .where(inArray(tickets.key, [...extractedKeys]));
    validTicketKeys = new Set(ticketRows.map((t) => t.key));
    for (const t of ticketRows) {
      ticketEpicMap.set(t.key, t.epicKey);
    }
  }

  let categorized = 0;
  for (const m of unclassified) {
    let category: string | null = null;
    let epicKey: string | null = null;
    let epicKeyInferred = m.epicKeyInferred;

    // Check for ticket key in title
    const ticketMatch = m.title.match(TICKET_KEY_RE);
    if (ticketMatch && validTicketKeys.has(ticketMatch[1])) {
      category = "dev";
      // Look up the ticket's epic
      const ticketEpic = ticketEpicMap.get(ticketMatch[1]);
      if (ticketEpic) {
        epicKey = ticketEpic;
        epicKeyInferred = true;
      }
    } else if (DEV_KEYWORDS.test(m.title)) {
      category = "dev";
    } else if (NON_DEV_KEYWORDS.test(m.title)) {
      category = "non_dev";
    }

    if (category === null) continue;

    const update: Record<string, unknown> = { category };
    if (epicKey) {
      update.epicKey = epicKey;
      update.epicKeyInferred = epicKeyInferred;
    }

    await db.update(meetings).set(update).where(eq(meetings.id, m.id));
    categorized++;
  }

  console.log(`[linker] Categorized ${categorized} meetings.`);
}
