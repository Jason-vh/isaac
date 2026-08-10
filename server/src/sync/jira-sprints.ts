import { db } from "../db";
import { sprints } from "../db/schema";
import { env } from "../env";
import { apiFetch, basicAuthHeader, runSyncWithLog } from "./util";

const PROJECT_KEY = "DESK";
const PAGE_SIZE = 50;

interface JiraBoard {
  id: number;
  name: string;
}

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

interface AgilePage<T> {
  values: T[];
  isLast: boolean;
}

function jiraBaseUrl(): string {
  // The API root is the Atlassian domain; JIRA_BASE_URL may carry a /jira suffix.
  return env.JIRA_BASE_URL.replace(/\/jira\/?$/, "");
}

/** Walks an Agile API collection, which pages with startAt/isLast. */
async function paginate<T>(url: URL, auth: string): Promise<T[]> {
  const all: T[] = [];
  let startAt = 0;

  while (true) {
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(PAGE_SIZE));

    const { data } = await apiFetch<AgilePage<T>>(url.toString(), {
      headers: { Authorization: auth },
    });

    all.push(...data.values);
    if (data.isLast || data.values.length === 0) return all;
    startAt += data.values.length;
  }
}

function toDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

/**
 * Mirrors the sprints of the project's board. Sprints are few and mutable —
 * dates get moved, sprints get renamed — so this refreshes all of them.
 */
export async function syncJiraSprints(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog(
    "jira-sprints",
    async () => {
      const baseUrl = jiraBaseUrl();
      const auth = basicAuthHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN);

      const boardUrl = new URL(`${baseUrl}/rest/agile/1.0/board`);
      boardUrl.searchParams.set("projectKeyOrId", PROJECT_KEY);
      const boards = await paginate<JiraBoard>(boardUrl, auth);
      if (boards.length === 0) {
        throw new Error(`No Jira board found for project ${PROJECT_KEY}`);
      }

      let synced = 0;
      for (const board of boards) {
        const sprintUrl = new URL(
          `${baseUrl}/rest/agile/1.0/board/${board.id}/sprint`
        );
        const found = await paginate<JiraSprint>(sprintUrl, auth);

        for (const sprint of found) {
          const values = {
            id: sprint.id,
            boardId: board.id,
            name: sprint.name.replace(/\s+/g, " ").trim(),
            state: sprint.state,
            goal: sprint.goal?.trim() || null,
            startDate: toDate(sprint.startDate),
            endDate: toDate(sprint.endDate),
            completeDate: toDate(sprint.completeDate),
            syncedAt: new Date(),
          };

          await db
            .insert(sprints)
            .values(values)
            .onConflictDoUpdate({ target: sprints.id, set: values });
        }
        synced += found.length;
      }

      return synced;
    },
    sinceOverride
  );
}
