import { db } from "../db";
import { mergeRequests, meetings, tickets } from "../db/schema";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { env } from "../env";
import { apiFetch, basicAuthHeader } from "./util";

// ---------------------------------------------------------------------------
// Ticket key regex: matches patterns like PROJ-123
// ---------------------------------------------------------------------------

const TICKET_KEY_RE = /([A-Z][A-Z0-9]+-\d+)/i;

// ---------------------------------------------------------------------------
// Meeting category heuristics
// ---------------------------------------------------------------------------

const DEV_KEYWORDS =
  /\b(standup|stand-up|sprint|retro|refinement|grooming|planning|tech|architecture|design review|code review|demo|deploy|incident|postmortem|post-mortem|1:1)\b/i;

const NON_DEV_KEYWORDS =
  /\b(all-hands|all hands|company|team social|lunch|offsite|hr|performance review)\b/i;

const LEAVE_KEYWORDS =
  /\b(sick|ziek|ooo|out of office|holiday|vacation|vakantie|verlof|leave|day off|free day|vrije dag)\b/i;

// Location / working-location events that should be ignored entirely
const IGNORE_KEYWORDS =
  /^(home|office|thuis|kantoor)$/i;

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

    const extractedKey = match[1].toUpperCase();
    // Only update if the value actually changed
    if (extractedKey === mr.ticketKey) continue;

    candidates.push({ mrId: mr.id, extractedKey });
  }

  if (candidates.length === 0) {
    console.log("[linker] No new MR links to infer.");
  } else {
    const candidateKeys = [...new Set(candidates.map((c) => c.extractedKey))];
    const existingTickets = await db
      .select({ key: tickets.key })
      .from(tickets)
      .where(inArray(tickets.key, candidateKeys));
    const validKeys = new Set(existingTickets.map((t) => t.key));

    // Fetch missing tickets from Jira so we can link to them
    // Batch in chunks of 30 to avoid 414 URI Too Long errors
    const missingKeys = candidateKeys.filter((k) => !validKeys.has(k));
    if (missingKeys.length > 0) {
      try {
        const baseUrl = env.JIRA_BASE_URL.replace(/\/jira\/?$/, "");
        const auth = basicAuthHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN);
        const BATCH_SIZE = 30;
        let totalFetched = 0;

        for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
          const batch = missingKeys.slice(i, i + BATCH_SIZE);
          const jql = `key in (${batch.map((k) => `"${k}"`).join(",")})`;
          const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
          url.searchParams.set("jql", jql);
          url.searchParams.set(
            "fields",
            "summary,issuetype,status,parent,created,updated"
          );
          url.searchParams.set("maxResults", "50");

          const { data } = await apiFetch<{
            issues: Array<{
              key: string;
              fields: {
                summary: string;
                issuetype: { name: string };
                status: { name: string };
                parent?: { key: string };
                created: string;
                updated: string;
              };
            }>;
          }>(url.toString(), { headers: { Authorization: auth } });

          for (const issue of data.issues) {
            await db
              .insert(tickets)
              .values({
                key: issue.key,
                title: issue.fields.summary,
                issueType: issue.fields.issuetype.name.toLowerCase(),
                status: issue.fields.status.name,
                storyPoints: null,
                parentKey: issue.fields.parent?.key ?? null,
                epicKey: null,
                createdByMe: false,
                assigneeIsMe: false,
                closedAt: null,
                jiraCreatedAt: new Date(issue.fields.created),
                jiraUpdatedAt: new Date(issue.fields.updated),
                syncedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: tickets.key,
                set: {
                  title: issue.fields.summary,
                  issueType: issue.fields.issuetype.name.toLowerCase(),
                  status: issue.fields.status.name,
                  parentKey: issue.fields.parent?.key ?? null,
                  jiraUpdatedAt: new Date(issue.fields.updated),
                  syncedAt: new Date(),
                },
              });
            validKeys.add(issue.key);
          }
          totalFetched += data.issues.length;
        }

        console.log(
          `[linker] Fetched ${totalFetched} missing tickets from Jira.`
        );
      } catch (err) {
        console.error("[linker] Failed to fetch missing tickets:", err);
      }
    }

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

  // Resolve epicKey for any tickets with parentKey but no epicKey
  await resolveEpicKeys();

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

    // Skip location events (Home, Office, etc.)
    if (IGNORE_KEYWORDS.test(m.title.trim())) {
      category = "ignore";
    // Check leave first (sick, OOO, holiday, etc.)
    } else if (LEAVE_KEYWORDS.test(m.title)) {
      category = "leave";
    // Check for ticket key in title
    } else {
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

// ---------------------------------------------------------------------------
// Resolve epicKey for tickets that have parentKey but no epicKey
// ---------------------------------------------------------------------------

async function resolveEpicKeys(): Promise<void> {
  const orphans = await db
    .select({ key: tickets.key, parentKey: tickets.parentKey })
    .from(tickets)
    .where(and(isNotNull(tickets.parentKey), isNull(tickets.epicKey)));

  console.log(`[linker] Found ${orphans.length} tickets with parentKey but no epicKey`);
  if (orphans.length > 0) {
    console.log(`[linker] Orphan samples:`, orphans.slice(0, 5).map((o) => `${o.key} → ${o.parentKey}`));
  }

  if (orphans.length === 0) return;

  const neededParentKeys = [...new Set(orphans.map((r) => r.parentKey!))];

  // Check which parents already exist in the DB
  const existingParents = await db
    .select({ key: tickets.key })
    .from(tickets)
    .where(inArray(tickets.key, neededParentKeys));
  const existingParentKeys = new Set(existingParents.map((r) => r.key));

  // Fetch missing parents from Jira
  const missingKeys = neededParentKeys.filter((k) => !existingParentKeys.has(k));
  if (missingKeys.length > 0) {
    try {
      const baseUrl = env.JIRA_BASE_URL.replace(/\/jira\/?$/, "");
      const auth = basicAuthHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN);

      const jql = `key in (${missingKeys.map((k) => `"${k}"`).join(",")})`;
      const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
      url.searchParams.set("jql", jql);
      url.searchParams.set("fields", "summary,issuetype,status,parent,created,updated");
      url.searchParams.set("maxResults", "50");

      const { data } = await apiFetch<{
        issues: Array<{
          key: string;
          fields: {
            summary: string;
            issuetype: { name: string };
            status: { name: string };
            parent?: { key: string };
            created: string;
            updated: string;
          };
        }>;
      }>(url.toString(), { headers: { Authorization: auth } });

      for (const issue of data.issues) {
        await db
          .insert(tickets)
          .values({
            key: issue.key,
            title: issue.fields.summary,
            issueType: issue.fields.issuetype.name.toLowerCase(),
            status: issue.fields.status.name,
            storyPoints: null,
            parentKey: issue.fields.parent?.key ?? null,
            epicKey: null,
            createdByMe: false,
            assigneeIsMe: false,
            closedAt: null,
            jiraCreatedAt: new Date(issue.fields.created),
            jiraUpdatedAt: new Date(issue.fields.updated),
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tickets.key,
            set: {
              title: issue.fields.summary,
              issueType: issue.fields.issuetype.name.toLowerCase(),
              status: issue.fields.status.name,
              parentKey: issue.fields.parent?.key ?? null,
              jiraUpdatedAt: new Date(issue.fields.updated),
              syncedAt: new Date(),
            },
          });
        existingParentKeys.add(issue.key);
      }

      console.log(`[linker] Fetched ${data.issues.length} missing parent tickets.`);
    } catch (err) {
      console.error("[linker] Failed to fetch parent tickets:", err);
    }
  }

  let resolved = 0;
  for (const row of orphans) {
    if (existingParentKeys.has(row.parentKey!)) {
      await db
        .update(tickets)
        .set({ epicKey: row.parentKey })
        .where(eq(tickets.key, row.key));
      resolved++;
    }
  }

  if (resolved > 0) {
    console.log(`[linker] Resolved epicKey for ${resolved} tickets.`);
  }
}
