import { EventSource } from "eventsource";

const JMAP_BASE = "https://api.fastmail.com";

export interface JmapSession {
  apiUrl: string;
  eventSourceUrl: string;
  primaryAccounts: Record<string, string>;
}

interface JmapEmail {
  id: string;
  subject: string;
  from: { name: string; email: string }[];
  receivedAt: string;
  textBody: { partId: string }[];
  htmlBody: { partId: string }[];
  bodyValues: Record<string, { value: string }>;
}

export interface Email {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  body: string;
}

function jmapHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function accountId(session: JmapSession): string {
  return session.primaryAccounts["urn:ietf:params:jmap:mail"];
}

export async function getSession(token: string): Promise<JmapSession> {
  const res = await fetch(`${JMAP_BASE}/.well-known/jmap`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`JMAP session failed: ${res.status}`);
  return res.json();
}

async function jmapCall(
  session: JmapSession,
  token: string,
  methodCalls: unknown[],
): Promise<any> {
  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: jmapHeaders(token),
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls,
    }),
  });
  if (!res.ok) throw new Error(`JMAP call failed: ${res.status}`);
  return res.json();
}

export type EmailFilter = { to: string };

function parseEmails(list: JmapEmail[]): Email[] {
  return list.map((e) => {
    const textPart = e.textBody?.[0]?.partId;
    const htmlPart = e.htmlBody?.[0]?.partId;
    const body =
      (textPart && e.bodyValues[textPart]?.value) ||
      (htmlPart && e.bodyValues[htmlPart]?.value) ||
      "";

    return {
      id: e.id,
      subject: e.subject,
      from: e.from?.[0]?.name || e.from?.[0]?.email || "unknown",
      receivedAt: e.receivedAt,
      body,
    };
  });
}

const EMAIL_PROPERTIES = [
  "subject",
  "from",
  "receivedAt",
  "textBody",
  "htmlBody",
  "bodyValues",
];

export async function getExistingEmails(
  session: JmapSession,
  token: string,
  filter: EmailFilter,
  limit = 50,
): Promise<{ emails: Email[]; queryState: string }> {
  const data = await jmapCall(session, token, [
    [
      "Email/query",
      {
        accountId: accountId(session),
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "0",
    ],
    [
      "Email/get",
      {
        accountId: accountId(session),
        "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
        properties: EMAIL_PROPERTIES,
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        maxBodyValueBytes: 10000,
      },
      "1",
    ],
  ]);

  const queryState: string = data.methodResponses[0][1].queryState;
  const emails = parseEmails(data.methodResponses[1][1].list);

  return { emails, queryState };
}

export async function getNewEmails(
  session: JmapSession,
  token: string,
  filter: EmailFilter,
  sinceQueryState: string,
): Promise<{ emails: Email[]; newState: string }> {
  const data = await jmapCall(session, token, [
    [
      "Email/queryChanges",
      {
        accountId: accountId(session),
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        sinceQueryState,
      },
      "0",
    ],
  ]);

  const response = data.methodResponses[0];

  // Handle cannotCalculateChanges — do a full re-query
  if (response[0] === "error") {
    console.warn(
      "[notify] queryChanges failed, doing full re-query:",
      response[1].type,
    );
    const freshData = await jmapCall(session, token, [
      [
        "Email/query",
        {
          accountId: accountId(session),
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: 1,
        },
        "0",
      ],
    ]);
    return {
      emails: [],
      newState: freshData.methodResponses[0][1].queryState,
    };
  }

  const added: { id: string; index: number }[] = response[1].added ?? [];
  const newState: string = response[1].newQueryState;

  if (added.length === 0) {
    return { emails: [], newState };
  }

  const ids = added.map((a) => a.id);
  const emailData = await jmapCall(session, token, [
    [
      "Email/get",
      {
        accountId: accountId(session),
        ids,
        properties: EMAIL_PROPERTIES,
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        maxBodyValueBytes: 10000,
      },
      "0",
    ],
  ]);

  return {
    emails: parseEmails(emailData.methodResponses[0][1].list),
    newState,
  };
}

function buildEventSourceUrl(session: JmapSession): string {
  return session.eventSourceUrl
    .replace("{types}", "Email")
    .replace("{closeafter}", "no")
    .replace("{ping}", "60");
}

export function connectEventSource(
  session: JmapSession,
  token: string,
  onEmailChange: () => void,
): Promise<void> {
  const url = buildEventSourceUrl(session);
  const account = accountId(session);

  return new Promise((_resolve, reject) => {
    const es = new EventSource(url, {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            Authorization: `Bearer ${token}`,
          },
        }),
    });

    es.onopen = () => {
      console.log("[notify] EventSource connected");
    };

    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const changed = data.changed ?? data.data?.changed ?? {};
        if (changed[account]?.Email) {
          console.log("[notify] Email state change detected");
          onEmailChange();
        }
      } catch {
        // ping or non-JSON, ignore
      }
    };

    es.onmessage = handleEvent;
    es.addEventListener("state", handleEvent as EventListener);
    es.addEventListener("ping", () => {});

    es.onerror = (event: Event) => {
      const err = event as Event & { code?: number; message?: string };
      console.error(
        "[notify] EventSource error:",
        err.message ?? "unknown",
        err.code ?? "",
      );
    };
  });
}
