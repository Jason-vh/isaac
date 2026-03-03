import { db } from "../db";
import { mergeRequests, tickets } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Ticket key regex: matches patterns like PROJ-123
// ---------------------------------------------------------------------------

const TICKET_KEY_RE = /([A-Z][A-Z0-9]+-\d+)/;

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
    console.log("[linker] No new links to infer.");
    return;
  }

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

  // TODO: Document → Epic linking (future implementation)
  // TODO: Meeting → Epic linking (future implementation)
}
