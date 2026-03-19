import { validateNotifyEnv, env } from "../env";
import {
  getSession,
  getExistingEmails,
  getNewEmails,
  connectEventSource,
} from "./jmap";
import type { Email, JmapSession } from "./jmap";
import { classifyEmail } from "./classify";
import { enrich } from "./enrich";
import { sendSlackNotification } from "./slack";

async function main() {
  validateNotifyEnv();

  const fastmailToken = env.FASTMAIL_TOKEN;
  const filterTo = env.FASTMAIL_FILTER_TO;
  const filter = { to: filterTo };

  console.log("[notify] Getting JMAP session...");
  let session = await getSession(fastmailToken);
  console.log("[notify] Session established");

  console.log(`[notify] Filtering emails to: ${filterTo}`);

  // Track processed email IDs to avoid duplicates on startup
  const processedIds = new Set<string>();

  async function processEmail(email: Email) {
    if (processedIds.has(email.id)) return;
    processedIds.add(email.id);

    const classified = classifyEmail(email);
    if (!classified) {
      console.log(`[notify] Skipping (unrecognized): ${email.subject}`);
      return;
    }

    console.log(
      `[notify] ${classified.action}: ${classified.mrTitle ?? email.subject}`,
    );

    try {
      const data = await enrich(classified);
      await sendSlackNotification(classified.action!, data, classified.sourceId);
      console.log(`[notify] Notified: ${classified.sourceId}`);
    } catch (err) {
      console.error(`[notify] Failed to process "${email.subject}":`, err);
    }
  }

  // On startup, record existing email IDs but don't process them
  const { emails: existing, queryState: initialState } =
    await getExistingEmails(session, fastmailToken, filter);
  let queryState = initialState;

  console.log(
    `[notify] Marked ${existing.length} existing email(s) as already processed`,
  );
  for (const email of existing) {
    processedIds.add(email.id);
  }

  // Concurrency guard for SSE events
  let processing = false;

  async function processNewEmails() {
    if (processing) return;
    processing = true;

    try {
      const { emails, newState } = await getNewEmails(
        session,
        fastmailToken,
        filter,
        queryState,
      );
      queryState = newState;

      if (emails.length === 0) return;

      console.log(`[notify] Processing ${emails.length} new email(s)...`);
      for (const email of emails) {
        await processEmail(email);
      }
    } catch (err: any) {
      // Session refresh on 401
      if (err?.message?.includes("401")) {
        console.log("[notify] Session expired, refreshing...");
        try {
          session = await getSession(fastmailToken);
          console.log("[notify] Session refreshed");
        } catch (refreshErr) {
          console.error("[notify] Session refresh failed:", refreshErr);
        }
      } else {
        console.error("[notify] Failed to fetch new emails:", err);
      }
    } finally {
      processing = false;
    }
  }

  console.log("[notify] Connecting to EventSource...");
  await connectEventSource(session, fastmailToken, processNewEmails);
}

main().catch((err) => {
  console.error("[notify] Fatal error:", err);
  process.exit(1);
});
