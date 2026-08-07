# Isaac

Personal impact tracker for my work at FareHarbor. It aggregates activity from
several sources into one system of record, serving two goals:

1. **Impact tracking** — a living brag document that captures what I've done,
   links it to objectives, and tells the story of my contributions.
2. **WBSO hour estimation** — a data source for weekly R&D hour submissions,
   categorised per ticket and grouped by epic.

Hosted at [isaac.vhtm.eu](https://isaac.vhtm.eu). Single user, passkey login.

## Design principles

- **Store facts, derive meaning.** Isaac records raw events ("commented on MR
  !432"). Interpretations like "reviewed" or WBSO categories are derived at
  report time, not at ingestion.
- **Infer links, allow manual override.** Automate linking where possible (MR
  branch name → ticket), but always allow manual correction.
- **Propose, never file.** WBSO estimates are suggestions to review and adjust.
  Isaac does not submit them anywhere — see [WBSO estimation](#wbso-estimation).
- **One viewer, many subjects.** A single *user*, but many *people* tracked.
  Teammates are first-class entities so team-level questions can be answered;
  they never log in.

## Data sources

| Source | What we track | Sync |
|---|---|---|
| **Jira** | Tickets created/closed/transitioned, story points, epics | Hourly |
| **GitLab** | All project MRs with per-file line counts and per-person review attribution. "Reviewed" = approved or commented | Hourly |
| **GitLab Pipelines** | Durations, per-job timing, retry/flaky rates, DAG dependencies | Hourly |
| **Confluence** | Documents published and commented on | Hourly |
| **Google Calendar** | Meetings attended, holidays/OOO | Hourly |
| **Slack bot** | Wins logged manually (`/isaac win …`) | Real-time |
| **GitLab emails** | MR comments, approvals, merges, review requests, mentions | Real-time via JMAP (isaac-notify) |

Corporate email is the join key between GitLab and Jira accounts. API tokens are
scoped to me, but the data they return covers the whole team.

## Domain model

Tables live in `server/src/db/schema.ts` — that's the source of truth for
columns and indexes. The concepts:

- **Ticket** — Jira issue. Story points, epic, status transitions. Has an
  assignee, a reporter, and an assignee-at-close.
- **Epic** — groups tickets. Also a Jira issue. Maps to WBSO projects, and is
  the primary linking grain for documents and meetings.
- **Merge request** — all project MRs are stored for denominator metrics.
  Three classes: authored, reviewed (approved or commented, not authored), and
  team. Linked to tickets via branch name, overridable by hand.
- **MR state event** — draft, ready, approved, unapproved, commits pushed,
  review requested. GitLab keeps these as system notes rather than fields, so
  they're parsed out of the note stream during sync. They define an MR's review
  window and its rework rounds.
- **Document** — Confluence page, linked to epics.
- **Meeting** — calendar event, categorised dev / non-dev / leave / ignore.
  Leave is detected by keyword on the title. Working-location events are
  ignored. All-day and multi-day events land on every weekday they span, using
  Amsterdam timezone boundaries.
- **Person** — engineer keyed by corporate email, with GitLab and Jira
  identities attached. Created during sync; bots are never recorded. Exactly one
  is flagged `isMe`.
- **Win** — logged via Slack, enriched on the web app. Can link to anything.
- **Objective** — annual objective with Key Results, hardcoded in
  `shared/objectives.ts`. Evidenced by tickets, wins and activity via
  `entity_links`.

## WBSO estimation

Isaac estimates hours per ticket per day, in six categories: coding, code
review, dev meeting, dev miscellaneous, non-dev, and leave.

### Fill-to-8h algorithm

`server/src/wbso/estimator.ts`. Every working day totals 8 hours:

1. **Meetings** use their actual calendar duration.
2. **Leave** fills the entire day — no other activity is placed on leave days.
3. **Remaining hours** (`8 - meetings`) are split proportionally across coding
   and review by relative weight: coding is `filesChanged * (dayCommits /
   totalCommits)`, review is `filesChanged * 0.1` (reviewing is faster than
   writing).
4. **Days with no activity at all** are flagged `needsInput` and left empty.
5. **Minimum 0.25h** per entry, with redistribution from larger entries.
6. **Quarter-hour rounding** uses Hamilton's method to preserve the 8h total.

Two things worth understanding about step 3. The weights measure *relative
size*, never duration — nothing in Isaac observes how long anything took. So
the 8h normalisation is a **cap, not a target**: a 10-hour day is compressed to
a claimed 8h, split by relative size, which understates rather than inflates.

Step 4 is why the zero-evidence case is handled separately. It used to borrow
the next weekday's coding weights, or fall back to a full 8h of `dev_misc`,
which asserted a full day of work from no evidence and attributed it to named
tickets. These hours go to a tax authority; a plausible guess is worse than a
blank, so those days are now surfaced empty for manual entry.

### Getting hours into the WBSO form

**Isaac does not submit anything.** The company WBSO tool attaches an explicit
anti-automation acknowledgement to every write, so filing is a manual act. What
Isaac does is make honest transcription fast:

- The **worksheet** (toggle on the WBSO view) renders the week in the WBSO
  form's own column order — Work Type, Work Description, Jira Issue, Jira Epic,
  WBSO/IDS Project, Hours — using the API's `work_type` enum values, with
  click-to-copy cells. The epic → WBSO project mapping is typed once and kept
  in localStorage.
- The **overview** groups entries by epic per day for review, with a detail
  panel showing the underlying MRs, commits and meetings behind each estimate,
  plus ticket search for linking unlinked entries.

The WBSO tool has its own sanctioned pre-fill (an AI suggestions feature). If
automatic entry is the goal, that's the route to ask about — not a client of
our own.

## Metrics

Two secondary outputs, both on their own pages. The numbers are easy; the
interpretation choices are the part worth documenting.

**Team productivity** (`/team`) — lines merged, lines reviewed, tickets closed
and story points per engineer, each split frontend/backend/other by file path.

- Lines of code is a *volume* signal, not a value signal. It's easy to game and
  rewards verbosity, so it's shown next to MR and ticket counts and never read
  alone. Generated files are excluded so a lockfile bump can't swamp a week.
- Every reviewer is credited the full diff, so team-wide reviewed lines exceed
  merged lines. This measures review *load*, which is the useful question.
- Closed tickets attribute to the assignee at close time, not whoever dragged
  the ticket to Done — often QA or a PM.

**Review health** (`/reviews`) — how work gets reviewed, scoped to MRs merged in
a period.

- Review starts when the MR goes in front of reviewers: the earliest of marked
  ready, reviewers requested, or first review comment. Not the ready flag (a
  third of MRs have reviewers requested while still draft), and not MR creation
  (an author sitting on a branch for a week isn't a slow review).
- The first approval often isn't the real one — a push resets approvals, and
  43% of merged MRs have more than one approval event. Both are reported, along
  with how often approvals reset.
- First approval is a minimum over ~8 people, since reviews are requested from
  the whole team at once. It measures responsiveness, not effort.
- Weekends are excluded from durations.
- Medians and tails, never averages. The p90 is where the pain lives.
- Comment counts are normalised by size, since a raw count mostly measures how
  big the MR was.

## Tech stack

Bun · Elysia · PostgreSQL + Drizzle · Passkeys (WebAuthn) + JWT · Vite + Vue 3 +
Tailwind · Railway.

`server/` is the API and sync jobs, `web/` the Vue SPA, `shared/` the types and
objectives used by both.

## Development

- **Install:** `bun install` from root
- **Server:** `bun run dev:server` (Elysia on port 3000)
- **Frontend:** `bun run dev:web` (Vite on 5173, proxies `/api` to the server)
- **Generate a migration:** `bun run --filter server db:generate` after changing
  `server/src/db/schema.ts`
- **Run it:** `cd server && bun run db:migrate` (`server/.env` has `DATABASE_URL`)

Always run migrations locally after generating them — don't leave unapplied
migrations. They run automatically on deploy via Railway's pre-deploy command.

### Debugging

- **Generate a local JWT:**
  ```sh
  cd server && bun --env-file ../.env -e "import { SignJWT } from 'jose'; const s = new TextEncoder().encode(process.env.JWT_SECRET); const t = await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject('isaac-owner').setIssuedAt().setExpirationTime('1h').sign(s); console.log(t)"
  ```
- **Trigger a backfill sync:**
  ```sh
  curl -s -X POST http://localhost:3000/api/sync/trigger \
    -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
    -d '{"sources": ["jira"], "since": "2026-01-01"}'
  ```
- **Inspect Jira:** `acli jira workitem view DESK-XXXX --fields '*all' --json`,
  or `acli jira workitem search --jql "project = DESK AND ..." --json`
- **Dev notify:** `bun run server/src/notify/run.ts`

## Production

Railway project `isaac`, environment `production`, auto-deploys on push to
`main`. Repo: `git@github.com:Jason-vh/isaac.git`.

| Service | Purpose |
|---|---|
| **isaac-web** | Elysia API + Vue SPA static files, single process |
| **isaac-cron** | Sync job (`server/src/sync/run.ts`) |
| **isaac-notify** | GitLab email → Slack, persistent JMAP SSE process |
| **isaac-db** | PostgreSQL |

- **Connect to the prod DB:** the internal URL won't work outside Railway — get
  the public one with `railway variables --json | grep DATABASE_PUBLIC_URL`,
  then `psql <url>`
- **Trigger a prod sync:** same curl as above against
  `https://isaac.vhtm.eu/api/sync/trigger`
- **Synced tables** (safe to truncate for a re-sync): `tickets`,
  `ticket_events`, `merge_requests`, `merge_request_events`,
  `merge_request_comments`, `commits`, `confluence_documents`,
  `confluence_document_events`, `meetings`, `pipelines`, `pipeline_jobs`,
  `sync_log`, `activity_items`
- **Preserved tables** (manually entered): `wins`, `entity_links`,
  `passkey_credentials`

### Sync architecture

A Railway cron job runs `server/src/sync/run.ts`, which checks `sync_log` for a
recent `running` entry (concurrent-sync guard), imports the DB and sync modules
directly, runs each source in sequence, then runs the linker to infer
relationships — skipping any row where `*_inferred = false`, so manual
corrections stick. The linker fetches missing tickets from Jira when branch
names reference tickets not yet stored, which is common for MRs authored by
others.

Calendar sync calls an Apps Script endpoint, so it needs no OAuth. Pipeline sync
uses REST for pipeline and job details plus GraphQL for the job `needs` DAG,
which REST doesn't expose.

### Environment variables

Validated in `server/src/env.ts`. Core vars are required at boot and the server
fails fast without them; sync vars are validated lazily, so the server starts
without them.

- **Core:** `DATABASE_URL`, `JWT_SECRET`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`
- **Sync:** `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `GITLAB_BASE_URL`,
  `GITLAB_API_TOKEN`, `GITLAB_PROJECT_ID`, `CONFLUENCE_BASE_URL`,
  `CONFLUENCE_API_TOKEN`, `CONFLUENCE_EMAIL`, `CALENDAR_SCRIPT_URL`,
  `CALENDAR_SCRIPT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`
- **Notify:** `FASTMAIL_TOKEN`, `FASTMAIL_FILTER_TO`, `SLACK_BOT_TOKEN`,
  `SLACK_CHANNEL_ID`, `GITLAB_*` and `JIRA_BASE_URL` as above

## Auth

Two token types. An **owner token** (JWT, subject `isaac-owner`, 7d) gives full
read/write access via passkey login. A **share token** (random string, 24h,
stored in `share_tokens`) gives read-only access, scoped to the page section it
was created from: `https://isaac.vhtm.eu/<page>?s=<token>`. The router strips
the param, stores the token, and renders in read-only mode. Write endpoints
return 403 for share tokens.

## Working rules

- If new domain concepts, entities, relationships or design decisions emerge,
  update this README so it keeps matching the current understanding.
- Schema and route details live in the code (`server/src/db/schema.ts`,
  `server/src/routes/`). Don't duplicate them here — they drift.
