// Person identity resolution across GitLab and Jira.
//
// Corporate email is the cross-system key: Jira exposes it directly on
// assignee/reporter, GitLab exposes it via publicEmail or the author's own
// commit emails. Users we cannot resolve to an email (bots) are skipped.

import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { people } from "../db/schema";
import { env } from "../env";
import { paginateGitLab } from "./util";

interface GitLabMember {
  username: string;
  name: string;
  public_email: string | null;
}

const BOT_USERNAME_PATTERNS = [
  /^project_\d+_bot/i,
  /^group_\d+_bot/i,
  /(^|[-_.])bot([-_.]|\d|$)/i,
  // GitLab reassigns deleted accounts to ghost placeholders (ghost, ghost1, ...).
  /^ghost\d*$/i,
];

const BOT_NAME_PATTERNS = [/^ghost user$/i];

const BOT_EMAIL_PATTERNS = [/noreply/i, /@users\.noreply/i];

export function isBotUser(
  username: string,
  email?: string | null,
  name?: string | null
): boolean {
  if (BOT_USERNAME_PATTERNS.some((re) => re.test(username))) return true;
  if (name && BOT_NAME_PATTERNS.some((re) => re.test(name))) return true;
  if (email && BOT_EMAIL_PATTERNS.some((re) => re.test(email))) return true;
  return false;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves GitLab usernames to corporate emails.
 * Seeded from project members, then topped up with commit author emails
 * discovered while walking merge requests.
 */
export class GitLabIdentityResolver {
  private emailByUsername = new Map<string, string>();
  private nameByUsername = new Map<string, string>();

  /** Seeds from people already resolved in previous sync runs. */
  async loadKnownPeople(): Promise<void> {
    const rows = await db
      .select({
        email: people.email,
        displayName: people.displayName,
        gitlabUsername: people.gitlabUsername,
      })
      .from(people)
      .where(isNotNull(people.gitlabUsername));
    for (const r of rows) {
      this.observe(r.gitlabUsername!, r.displayName, r.email);
    }
  }

  async loadProjectMembers(): Promise<void> {
    const members = await paginateGitLab<GitLabMember>(
      `${env.GITLAB_BASE_URL}/api/v4/projects/${env.GITLAB_PROJECT_ID}/members/all`,
      { "PRIVATE-TOKEN": env.GITLAB_API_TOKEN }
    );
    for (const m of members) {
      this.observe(m.username, m.name, m.public_email);
    }
  }

  /** Records what we know about a GitLab user; email is optional. */
  observe(username: string, name?: string | null, email?: string | null): void {
    if (isBotUser(username, email, name)) return;
    if (name) this.nameByUsername.set(username, name);
    if (email && !this.emailByUsername.has(username)) {
      this.emailByUsername.set(username, normaliseEmail(email));
    }
  }

  /**
   * Learns emails from an MR's commits by matching the commit author name
   * to the GitLab display name of the MR author.
   */
  observeCommits(
    username: string,
    commits: Array<{ author_name: string; author_email: string }>
  ): void {
    if (this.emailByUsername.has(username) || isBotUser(username)) return;
    const displayName = this.nameByUsername.get(username);
    if (!displayName) return;
    // Require the commit author name to match. Guessing from an unrelated
    // commit would bind someone else's email to this account, and because
    // people are keyed by email that would corrupt the real person's row.
    const match = commits.find(
      (c) =>
        c.author_name === displayName &&
        !BOT_EMAIL_PATTERNS.some((re) => re.test(c.author_email))
    );
    if (match) {
      this.emailByUsername.set(username, normaliseEmail(match.author_email));
    }
  }

  getEmail(username: string): string | undefined {
    return this.emailByUsername.get(username);
  }

  getName(username: string): string | undefined {
    return this.nameByUsername.get(username);
  }

  /** Upserts the person for a GitLab username, or null if unresolvable. */
  async resolve(username: string): Promise<number | null> {
    const name = this.nameByUsername.get(username);
    if (isBotUser(username, null, name)) return null;
    const email = this.emailByUsername.get(username);
    if (!email) return null;
    return upsertPerson({
      email,
      displayName: name ?? username,
      gitlabUsername: username,
    });
  }
}

interface UpsertPersonInput {
  email: string;
  displayName: string;
  gitlabUsername?: string;
  jiraAccountId?: string;
}

const personIdCache = new Map<string, number>();

/**
 * Upserts a person by email, attaching provider identities as they appear.
 * A stale identity on another row is cleared first, since both are unique.
 */
export async function upsertPerson(
  input: UpsertPersonInput
): Promise<number | null> {
  const email = normaliseEmail(input.email);
  if (!email || isBotUser(input.gitlabUsername ?? "", email)) return null;

  const cacheKey = `${email}|${input.gitlabUsername ?? ""}|${input.jiraAccountId ?? ""}`;
  const cached = personIdCache.get(cacheKey);
  if (cached) return cached;

  if (input.gitlabUsername) {
    await db
      .update(people)
      .set({ gitlabUsername: null })
      .where(
        sql`${people.gitlabUsername} = ${input.gitlabUsername} AND ${people.email} <> ${email}`
      );
  }
  if (input.jiraAccountId) {
    await db
      .update(people)
      .set({ jiraAccountId: null })
      .where(
        sql`${people.jiraAccountId} = ${input.jiraAccountId} AND ${people.email} <> ${email}`
      );
  }

  const now = new Date();
  const [row] = await db
    .insert(people)
    .values({
      email,
      displayName: input.displayName,
      gitlabUsername: input.gitlabUsername ?? null,
      jiraAccountId: input.jiraAccountId ?? null,
      isMe: false,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: people.email,
      set: {
        displayName: input.displayName,
        // COALESCE so a source that lacks an identity doesn't erase it.
        gitlabUsername: sql`coalesce(excluded.gitlab_username, ${people.gitlabUsername})`,
        jiraAccountId: sql`coalesce(excluded.jira_account_id, ${people.jiraAccountId})`,
        updatedAt: now,
      },
    })
    .returning({ id: people.id });

  personIdCache.set(cacheKey, row.id);
  return row.id;
}

/** Looks up an existing person by Jira account id. */
export async function lookupPersonByJiraAccountId(
  accountId: string | null
): Promise<number | null> {
  if (!accountId) return null;
  const [row] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.jiraAccountId, accountId))
    .limit(1);
  return row?.id ?? null;
}

/** Flags the person matching the configured Jira account as the owner. */
export async function markOwner(email: string): Promise<void> {
  const normalised = normaliseEmail(email);
  await db.update(people).set({ isMe: false }).where(eq(people.isMe, true));
  await db
    .update(people)
    .set({ isMe: true, updatedAt: new Date() })
    .where(eq(people.email, normalised));
}

/** Clears the per-run memo; sync entry points call this before starting. */
export function resetPersonCache(): void {
  personIdCache.clear();
}
